//! App-managed kubectl / helm binaries (download latest into data dir).

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{anyhow, bail, Context, Result};
use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use tar::Archive;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sToolInfo {
    pub name: String,
    pub installed: bool,
    /// true when binary lives under TerminalWisely/bin
    pub app_managed: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    /// Latest upstream stable (when checked).
    #[serde(default)]
    pub latest_version: Option<String>,
    /// installed && latest known && installed < latest
    #[serde(default)]
    pub update_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sToolsStatus {
    pub bin_dir: String,
    pub kubectl: K8sToolInfo,
    pub helm: K8sToolInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum K8sToolKind {
    Kubectl,
    Helm,
    All,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct ToolsMeta {
    kubectl_version: Option<String>,
    helm_version: Option<String>,
    updated_at: Option<String>,
}

pub fn tools_bin_dir() -> Result<PathBuf> {
    let dir = dirs::data_local_dir()
        .or_else(dirs::home_dir)
        .context("data dir")?
        .join("TerminalWisely")
        .join("bin");
    fs::create_dir_all(&dir).ok();
    Ok(dir)
}

fn tool_file_name(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

/// Prefer app-managed binary; otherwise bare name for PATH lookup.
pub fn resolve_tool(name: &str) -> PathBuf {
    if let Ok(dir) = tools_bin_dir() {
        let candidate = dir.join(tool_file_name(name));
        if candidate.is_file() {
            return candidate;
        }
    }
    PathBuf::from(name)
}

fn meta_path(dir: &Path) -> PathBuf {
    dir.join("tools.json")
}

fn load_meta(dir: &Path) -> ToolsMeta {
    let path = meta_path(dir);
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_meta(dir: &Path, meta: &ToolsMeta) -> Result<()> {
    let path = meta_path(dir);
    fs::write(path, serde_json::to_string_pretty(meta)?)?;
    Ok(())
}

fn probe_version(bin: &Path, args: &[&str]) -> Option<String> {
    let out = Command::new(bin).args(args).output().ok()?;
    if !out.status.success() && out.stdout.is_empty() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let line = text.lines().next().unwrap_or(text.as_ref()).trim();
    if line.is_empty() {
        None
    } else {
        Some(line.to_string())
    }
}

fn which_on_path(name: &str) -> Option<PathBuf> {
    let key = if cfg!(windows) { "Path" } else { "PATH" };
    let path = std::env::var_os(key)?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(tool_file_name(name));
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn tool_info(name: &str, version_args: &[&str]) -> K8sToolInfo {
    let app = tools_bin_dir()
        .ok()
        .map(|d| d.join(tool_file_name(name)))
        .filter(|p| p.is_file());
    if let Some(path) = app {
        return K8sToolInfo {
            name: name.into(),
            installed: true,
            app_managed: true,
            version: probe_version(&path, version_args),
            path: Some(path.to_string_lossy().into_owned()),
            latest_version: None,
            update_available: false,
        };
    }
    if let Some(path) = which_on_path(name) {
        return K8sToolInfo {
            name: name.into(),
            installed: true,
            app_managed: false,
            version: probe_version(&path, version_args),
            path: Some(path.to_string_lossy().into_owned()),
            latest_version: None,
            update_available: false,
        };
    }
    K8sToolInfo {
        name: name.into(),
        installed: false,
        app_managed: false,
        path: None,
        version: None,
        latest_version: None,
        update_available: false,
    }
}

fn parse_semver(s: &str) -> Option<(u32, u32, u32)> {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i].is_ascii_digit() {
            break;
        }
        i += 1;
    }
    if i >= bytes.len() {
        return None;
    }
    let rest = &s[i..];
    let mut parts = rest
        .split(|c: char| !c.is_ascii_digit())
        .filter(|p| !p.is_empty())
        .take(3);
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next().and_then(|p| p.parse().ok()).unwrap_or(0);
    Some((major, minor, patch))
}

fn is_older(installed: &str, latest: &str) -> bool {
    match (parse_semver(installed), parse_semver(latest)) {
        (Some(a), Some(b)) => a < b,
        _ => false,
    }
}

fn apply_latest(info: &mut K8sToolInfo, latest: Option<String>) {
    info.latest_version = latest.clone();
    info.update_available = match (&info.version, latest) {
        (Some(cur), Some(lat)) if info.installed => is_older(cur, &lat),
        _ => false,
    };
}

pub fn tools_status() -> Result<K8sToolsStatus> {
    let bin_dir = tools_bin_dir()?;
    Ok(K8sToolsStatus {
        bin_dir: bin_dir.to_string_lossy().into_owned(),
        kubectl: tool_info("kubectl", &["version", "--client"]),
        helm: tool_info("helm", &["version", "--short"]),
    })
}

/// Local probe + latest-version check (gray / green / yellow dots).
pub async fn tools_status_checked() -> Result<K8sToolsStatus> {
    let mut status = tools_status()?;
    let kubectl_latest = http_get_text("https://dl.k8s.io/release/stable.txt")
        .await
        .ok();
    let helm_latest = http_get_text("https://get.helm.sh/helm-latest-version")
        .await
        .ok();
    apply_latest(&mut status.kubectl, kubectl_latest);
    apply_latest(&mut status.helm, helm_latest);
    Ok(status)
}

fn host_triple() -> Result<(&'static str, &'static str)> {
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        "linux" => "linux",
        "windows" => "windows",
        other => bail!("unsupported OS for kubectl/helm download: {other}"),
    };
    let arch = match std::env::consts::ARCH {
        "x86_64" => "amd64",
        "aarch64" => "arm64",
        other => bail!("unsupported arch for kubectl/helm download: {other}"),
    };
    Ok((os, arch))
}

async fn http_get_bytes(url: &str) -> Result<Vec<u8>> {
    let client = reqwest::Client::builder()
        .user_agent(concat!("TerminalWisely/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(120))
        .build()?;
    let resp = client.get(url).send().await.with_context(|| format!("GET {url}"))?;
    if !resp.status().is_success() {
        bail!("download failed {}: {}", resp.status(), url);
    }
    Ok(resp.bytes().await?.to_vec())
}

async fn http_get_text(url: &str) -> Result<String> {
    let bytes = http_get_bytes(url).await?;
    Ok(String::from_utf8_lossy(&bytes).trim().to_string())
}

fn write_executable(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("download");
    {
        let mut f = File::create(&tmp).with_context(|| format!("create {}", tmp.display()))?;
        f.write_all(bytes)?;
        f.sync_all().ok();
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&tmp)?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&tmp, perms)?;
    }
    if path.exists() {
        fs::remove_file(path).ok();
    }
    fs::rename(&tmp, path).with_context(|| format!("install {}", path.display()))?;
    Ok(())
}

async fn install_kubectl(dir: &Path) -> Result<String> {
    let (os, arch) = host_triple()?;
    let version = http_get_text("https://dl.k8s.io/release/stable.txt").await?;
    let version = version.trim().to_string();
    if version.is_empty() {
        bail!("empty kubectl stable version");
    }
    let url = format!("https://dl.k8s.io/release/{version}/bin/{os}/{arch}/kubectl");
    let bytes = http_get_bytes(&url).await?;
    if bytes.len() < 1024 {
        bail!("kubectl download too small ({})", bytes.len());
    }
    let dest = dir.join(tool_file_name("kubectl"));
    write_executable(&dest, &bytes)?;
    let _ = Command::new(&dest)
        .args(["version", "--client", "--short"])
        .output();
    Ok(version)
}

fn extract_helm_from_tar_gz(archive: &[u8], dest: &Path) -> Result<()> {
    let decoder = GzDecoder::new(std::io::Cursor::new(archive));
    let mut tar = Archive::new(decoder);
    let want = tool_file_name("helm");
    for entry in tar.entries()? {
        let mut entry = entry?;
        let path = entry.path()?.into_owned();
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        if name != want && name != "helm" {
            continue;
        }
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf)?;
        write_executable(dest, &buf)?;
        return Ok(());
    }
    bail!("helm binary not found in archive");
}

#[cfg(windows)]
fn extract_helm_from_zip(archive: &[u8], dest: &Path) -> Result<()> {
    let reader = std::io::Cursor::new(archive);
    let mut zip = zip::ZipArchive::new(reader)?;
    for i in 0..zip.len() {
        let mut file = zip.by_index(i)?;
        let name = file.name().to_string();
        if !name.ends_with("helm.exe") && !name.ends_with("/helm.exe") {
            continue;
        }
        let mut buf = Vec::new();
        file.read_to_end(&mut buf)?;
        write_executable(dest, &buf)?;
        return Ok(());
    }
    bail!("helm.exe not found in zip");
}

async fn latest_helm_tag() -> Result<String> {
    // Official channel — avoids GitHub API 403 / rate limits.
    let tag = http_get_text("https://get.helm.sh/helm-latest-version").await?;
    let tag = tag.trim().to_string();
    if tag.is_empty() || !tag.starts_with('v') {
        bail!("unexpected helm-latest-version: {tag}");
    }
    Ok(tag)
}

async fn install_helm(dir: &Path) -> Result<String> {
    let (os, arch) = host_triple()?;
    let tag = latest_helm_tag().await?;
    let dest = dir.join(tool_file_name("helm"));
    #[cfg(windows)]
    {
        let url = format!("https://get.helm.sh/helm-{tag}-{os}-{arch}.zip");
        let bytes = http_get_bytes(&url).await?;
        extract_helm_from_zip(&bytes, &dest)?;
    }
    #[cfg(not(windows))]
    {
        let url = format!("https://get.helm.sh/helm-{tag}-{os}-{arch}.tar.gz");
        let bytes = http_get_bytes(&url).await?;
        extract_helm_from_tar_gz(&bytes, &dest)?;
    }
    let _ = Command::new(&dest).args(["version", "--short"]).output();
    Ok(tag)
}

pub async fn install_tools(kind: K8sToolKind) -> Result<K8sToolsStatus> {
    let dir = tools_bin_dir()?;
    let mut meta = load_meta(&dir);
    let mut errors: Vec<String> = Vec::new();

    let want_kubectl = matches!(kind, K8sToolKind::Kubectl | K8sToolKind::All);
    let want_helm = matches!(kind, K8sToolKind::Helm | K8sToolKind::All);

    if want_kubectl {
        match install_kubectl(&dir).await {
            Ok(v) => meta.kubectl_version = Some(v),
            Err(err) => errors.push(format!("kubectl: {err:#}")),
        }
    }
    if want_helm {
        match install_helm(&dir).await {
            Ok(v) => meta.helm_version = Some(v),
            Err(err) => errors.push(format!("helm: {err:#}")),
        }
    }

    meta.updated_at = Some(chrono::Utc::now().to_rfc3339());
    save_meta(&dir, &meta)?;
    let status = tools_status_checked().await?;
    if !errors.is_empty() {
        bail!(
            "{}; status: kubectl={} helm={}",
            errors.join("; "),
            if status.kubectl.installed {
                status
                    .kubectl
                    .version
                    .clone()
                    .unwrap_or_else(|| "ok".into())
            } else {
                "missing".into()
            },
            if status.helm.installed {
                status.helm.version.clone().unwrap_or_else(|| "ok".into())
            } else {
                "missing".into()
            }
        );
    }
    Ok(status)
}

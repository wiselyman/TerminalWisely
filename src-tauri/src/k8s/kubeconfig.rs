use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::{Context, Result};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_yaml::Value;

use super::K8sContextInfo;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportedKubeconfig {
    pub path: String,
    #[serde(default)]
    pub display_name: Option<String>,
}

/// Backward-compatible: old files were a bare string array.
#[derive(Deserialize)]
#[serde(untagged)]
enum ImportedWire {
    Path(String),
    Entry(ImportedKubeconfig),
}

static IMPORTED: Lazy<Mutex<Vec<ImportedKubeconfig>>> = Lazy::new(|| {
    Mutex::new(load_imported().unwrap_or_default())
});

fn imported_paths_file() -> Result<PathBuf> {
    let dir = dirs::data_local_dir()
        .or_else(dirs::home_dir)
        .context("data dir")?
        .join("TerminalWisely");
    fs::create_dir_all(&dir).ok();
    Ok(dir.join("k8s-kubeconfig-paths.json"))
}

fn load_imported() -> Result<Vec<ImportedKubeconfig>> {
    let path = imported_paths_file()?;
    if !path.is_file() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(path)?;
    let wire: Vec<ImportedWire> = serde_json::from_str(&raw).unwrap_or_default();
    Ok(wire
        .into_iter()
        .map(|w| match w {
            ImportedWire::Path(path) => ImportedKubeconfig {
                path,
                display_name: None,
            },
            ImportedWire::Entry(e) => e,
        })
        .collect())
}

fn save_imported(entries: &[ImportedKubeconfig]) -> Result<()> {
    let path = imported_paths_file()?;
    fs::write(path, serde_json::to_string_pretty(entries)?)?;
    Ok(())
}

pub fn list_imported_kubeconfig_paths() -> Vec<String> {
    IMPORTED
        .lock()
        .unwrap()
        .iter()
        .map(|e| e.path.clone())
        .collect()
}

fn upsert_imported(path: String, display_name: Option<String>) -> Result<()> {
    let mut guard = IMPORTED.lock().unwrap();
    if let Some(existing) = guard.iter_mut().find(|e| e.path == path) {
        // Always overwrite alias when caller provides one (re-import / rename).
        if display_name.is_some() {
            existing.display_name = display_name;
        }
    } else {
        guard.push(ImportedKubeconfig {
            path,
            display_name,
        });
    }
    save_imported(&guard)?;
    Ok(())
}

/// Update display name for an already-imported kubeconfig path.
/// If the path is not yet in the import registry (e.g. default ~/.kube/config),
/// register it with the given alias so the label sticks across reloads.
pub fn set_imported_display_name(path: &str, display_name: &str) -> Result<Vec<K8sContextInfo>> {
    let alias = display_name.trim();
    if alias.is_empty() {
        anyhow::bail!("display name is required");
    }
    let p = PathBuf::from(path.trim());
    let canonical = if p.is_file() {
        p.canonicalize()
            .unwrap_or(p)
            .to_string_lossy()
            .into_owned()
    } else {
        path.trim().to_string()
    };
    {
        let mut guard = IMPORTED.lock().unwrap();
        if let Some(existing) = guard
            .iter_mut()
            .find(|e| e.path == canonical || e.path == path)
        {
            existing.display_name = Some(alias.to_string());
        } else {
            if !PathBuf::from(&canonical).is_file() {
                anyhow::bail!("kubeconfig file not found");
            }
            guard.push(ImportedKubeconfig {
                path: canonical,
                display_name: Some(alias.to_string()),
            });
        }
        save_imported(&guard)?;
    }
    discover_contexts()
}

pub fn read_kubeconfig_yaml(path: &str) -> Result<String> {
    let p = PathBuf::from(path.trim());
    if !p.is_file() {
        anyhow::bail!("kubeconfig file not found: {}", p.display());
    }
    fs::read_to_string(&p).with_context(|| format!("read {}", p.display()))
}

/// Update display name and/or rewrite kubeconfig YAML at `path`.
pub fn update_kubeconfig(
    path: &str,
    display_name: Option<&str>,
    yaml: Option<&str>,
) -> Result<Vec<K8sContextInfo>> {
    let p = PathBuf::from(path.trim());
    if !p.is_file() {
        anyhow::bail!("kubeconfig file not found: {}", p.display());
    }
    let canonical = p
        .canonicalize()
        .unwrap_or(p.clone())
        .to_string_lossy()
        .into_owned();

    if let Some(raw) = yaml {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            anyhow::bail!("empty kubeconfig");
        }
        let _ = parse_contexts_from_str(trimmed)?;
        fs::write(&canonical, trimmed).with_context(|| format!("write {}", canonical))?;
    }

    if let Some(name) = display_name.map(str::trim).filter(|s| !s.is_empty()) {
        return set_imported_display_name(&canonical, name);
    }
    if yaml.is_some() {
        upsert_imported(canonical, None)?;
    }
    discover_contexts()
}

pub fn import_kubeconfig_path(
    path: &str,
    display_name: Option<&str>,
) -> Result<Vec<K8sContextInfo>> {
    let p = PathBuf::from(path.trim());
    if !p.is_file() {
        anyhow::bail!("kubeconfig file not found: {}", p.display());
    }
    let _ = parse_contexts_from_file(&p)?;
    let canonical = p
        .canonicalize()
        .unwrap_or(p)
        .to_string_lossy()
        .into_owned();
    let alias = display_name
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    upsert_imported(canonical, alias)?;
    discover_contexts()
}

pub fn import_kubeconfig_yaml(
    yaml: &str,
    display_name: Option<&str>,
) -> Result<Vec<K8sContextInfo>> {
    let trimmed = yaml.trim();
    if trimmed.is_empty() {
        anyhow::bail!("empty kubeconfig");
    }
    let _ = parse_contexts_from_str(trimmed)?;
    let dir = dirs::data_local_dir()
        .or_else(dirs::home_dir)
        .context("data dir")?
        .join("TerminalWisely")
        .join("kubeconfigs");
    fs::create_dir_all(&dir).ok();
    let file = dir.join(format!("{}.yaml", uuid::Uuid::new_v4()));
    fs::write(&file, trimmed).context("write pasted kubeconfig")?;
    import_kubeconfig_path(file.to_string_lossy().as_ref(), display_name)
}

pub fn remove_imported_kubeconfig_path(path: &str) -> Result<()> {
    let mut guard = IMPORTED.lock().unwrap();
    guard.retain(|e| e.path != path);
    save_imported(&guard)?;
    let p = PathBuf::from(path);
    if let Some(parent) = p.parent() {
        if parent
            .file_name()
            .and_then(|s| s.to_str())
            .is_some_and(|n| n == "kubeconfigs")
            && p.is_file()
        {
            let _ = fs::remove_file(&p);
        }
    }
    Ok(())
}

fn alias_label(alias: Option<&str>, context_name: &str, multi: bool) -> String {
    match alias {
        Some(a) if multi => format!("{a}/{context_name}"),
        Some(a) => a.to_string(),
        None => context_name.to_string(),
    }
}

pub fn discover_contexts() -> Result<Vec<K8sContextInfo>> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let imported = IMPORTED.lock().unwrap().clone();

    if let Ok(default_path) = default_kubeconfig_path() {
        if default_path.is_file() {
            // If the user "imported" ~/.kube/config with a Name, honor that alias
            // instead of silently falling back to the kube context name (often "default").
            let default_entry = imported.iter().find(|e| {
                let p = PathBuf::from(&e.path);
                paths_equal(&p, &default_path)
            });
            let alias = default_entry
                .and_then(|e| e.display_name.as_deref())
                .map(str::trim)
                .filter(|s| !s.is_empty());
            let contexts = parse_contexts_from_file(&default_path)?;
            let multi = contexts.len() > 1;
            let source = if default_entry.is_some() {
                "imported"
            } else {
                "default"
            };
            for mut ctx in contexts {
                let key = format!("{}::{}", default_path.display(), ctx.name);
                if seen.insert(key) {
                    ctx.kubeconfig_path = Some(default_path.to_string_lossy().into_owned());
                    ctx.source = source.into();
                    ctx.display_name = Some(alias_label(alias, &ctx.name, multi));
                    out.push(ctx);
                }
            }
        }
    }

    for entry in imported {
        let path = PathBuf::from(&entry.path);
        if !path.is_file() {
            continue;
        }
        if let Ok(default_path) = default_kubeconfig_path() {
            if paths_equal(&path, &default_path) {
                continue;
            }
        }
        match parse_contexts_from_file(&path) {
            Ok(contexts) => {
                let multi = contexts.len() > 1;
                let alias = entry
                    .display_name
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty());
                for mut ctx in contexts {
                    let key = format!("{}::{}", path.display(), ctx.name);
                    if seen.insert(key) {
                        ctx.kubeconfig_path = Some(path.to_string_lossy().into_owned());
                        ctx.source = "imported".into();
                        ctx.display_name = Some(alias_label(alias, &ctx.name, multi));
                        out.push(ctx);
                    }
                }
            }
            Err(err) => {
                log::warn!("skip kubeconfig {}: {err}", path.display());
            }
        }
    }

    out.sort_by(|a, b| {
        a.display_name
            .cmp(&b.display_name)
            .then(a.name.cmp(&b.name))
            .then(a.kubeconfig_path.cmp(&b.kubeconfig_path))
    });
    Ok(out)
}

fn paths_equal(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(aa), Ok(bb)) => aa == bb,
        _ => a == b,
    }
}

fn parse_contexts_from_file(path: &Path) -> Result<Vec<K8sContextInfo>> {
    let raw = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    parse_contexts_from_str(&raw)
}

fn parse_contexts_from_str(raw: &str) -> Result<Vec<K8sContextInfo>> {
    let doc: Value = serde_yaml::from_str(raw).context("parse kubeconfig")?;
    let current = doc
        .get("current-context")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let contexts = doc
        .get("contexts")
        .and_then(|v| v.as_sequence())
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for ctx in contexts {
        let name = ctx
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if name.is_empty() {
            continue;
        }
        let cluster = ctx
            .get("context")
            .and_then(|c| c.get("cluster"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let user = ctx
            .get("context")
            .and_then(|c| c.get("user"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        out.push(K8sContextInfo {
            name: name.clone(),
            cluster,
            user,
            current: name == current,
            kubeconfig_path: None,
            source: "default".into(),
            display_name: None,
        });
    }
    if out.is_empty() {
        anyhow::bail!("kubeconfig has no contexts");
    }
    Ok(out)
}

fn default_kubeconfig_path() -> Result<PathBuf> {
    if let Ok(p) = std::env::var("KUBECONFIG") {
        let first = p.split(':').next().unwrap_or(&p).trim();
        if !first.is_empty() {
            return Ok(PathBuf::from(first));
        }
    }
    let home = dirs::home_dir().context("home dir")?;
    Ok(home.join(".kube").join("config"))
}

use std::path::{Path, PathBuf};
use std::process::Stdio;

use crate::error::{AppError, AppResult};
use crate::shell::shell_quote_remote_path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArchiveKind {
    TarGz,
    TarBz2,
    TarXz,
    Tar,
    Zip,
    Gzip,
}

pub fn archive_kind_from_name(name: &str) -> Option<ArchiveKind> {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".tar.gz") || lower.ends_with(".tgz") {
        Some(ArchiveKind::TarGz)
    } else if lower.ends_with(".tar.bz2") || lower.ends_with(".tbz2") || lower.ends_with(".tbz") {
        Some(ArchiveKind::TarBz2)
    } else if lower.ends_with(".tar.xz") || lower.ends_with(".txz") {
        Some(ArchiveKind::TarXz)
    } else if lower.ends_with(".tar") {
        Some(ArchiveKind::Tar)
    } else if lower.ends_with(".zip") {
        Some(ArchiveKind::Zip)
    } else if lower.ends_with(".gz") {
        Some(ArchiveKind::Gzip)
    } else {
        None
    }
}

pub fn remote_compress_command(parent: &str, basename: &str, archive_path: &str) -> String {
    format!(
        "tar czf {} -C {} {}",
        shell_quote_remote_path(archive_path),
        shell_quote_remote_path(parent),
        shell_quote_remote_path(basename),
    )
}

pub fn remote_extract_command(
    kind: ArchiveKind,
    archive_path: &str,
    parent: &str,
) -> AppResult<String> {
    let archive = shell_quote_remote_path(archive_path);
    let dest = shell_quote_remote_path(parent);
    let cmd = match kind {
        ArchiveKind::TarGz => format!("tar xzf {archive} -C {dest}"),
        ArchiveKind::TarBz2 => format!("tar xjf {archive} -C {dest}"),
        ArchiveKind::TarXz => format!("tar xJf {archive} -C {dest}"),
        ArchiveKind::Tar => format!("tar xf {archive} -C {dest}"),
        ArchiveKind::Zip => format!(
            "(command -v unzip >/dev/null 2>&1 && unzip -o {archive} -d {dest}) || tar xf {archive} -C {dest}"
        ),
        ArchiveKind::Gzip => {
            // Keep the .gz file; write decompressed sibling in the same directory.
            format!("gzip -dkf {archive}")
        }
    };
    Ok(cmd)
}

pub async fn local_compress(
    parent: &Path,
    basename: &str,
    archive_path: &Path,
) -> AppResult<()> {
    let archive = path_string(archive_path)?;
    let parent_s = path_string(parent)?;
    run_tar(&["czf", &archive, "-C", &parent_s, basename]).await
}

pub async fn local_extract(
    kind: ArchiveKind,
    archive_path: &Path,
    parent: &Path,
) -> AppResult<()> {
    let archive = path_string(archive_path)?;
    let parent_s = path_string(parent)?;
    match kind {
        ArchiveKind::TarGz => run_tar(&["xzf", &archive, "-C", &parent_s]).await,
        ArchiveKind::TarBz2 => run_tar(&["xjf", &archive, "-C", &parent_s]).await,
        ArchiveKind::TarXz => run_tar(&["xJf", &archive, "-C", &parent_s]).await,
        ArchiveKind::Tar | ArchiveKind::Zip => {
            // bsdtar (macOS / Windows tar.exe) extracts zip as well.
            run_tar(&["xf", &archive, "-C", &parent_s]).await
        }
        ArchiveKind::Gzip => run_command("gzip", &["-dkf", &archive]).await,
    }
}

fn path_string(path: &Path) -> AppResult<String> {
    path.to_str()
        .map(str::to_string)
        .ok_or_else(|| AppError::msg("路径包含无效字符"))
}

async fn run_tar(args: &[&str]) -> AppResult<()> {
    run_command("tar", args).await
}

async fn run_command(program: &str, args: &[&str]) -> AppResult<()> {
    let output = tokio::process::Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|err| AppError::msg(format!("无法执行 {program}: {err}")))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let detail = if !stderr.trim().is_empty() {
        stderr.trim()
    } else if !stdout.trim().is_empty() {
        stdout.trim()
    } else {
        return Err(AppError::msg(format!(
            "{program} 失败，退出码 {}",
            output.status.code().unwrap_or(-1)
        )));
    };
    Err(AppError::msg(detail.to_string()))
}

pub fn archive_output_path(parent: &str, basename: &str) -> String {
    let archive_name = format!("{basename}.tar.gz");
    if parent == "/" {
        format!("/{archive_name}")
    } else {
        format!(
            "{}/{}",
            parent.trim_end_matches('/'),
            archive_name
        )
    }
}

pub fn local_archive_output_path(parent: &Path, basename: &str) -> PathBuf {
    parent.join(format!("{basename}.tar.gz"))
}

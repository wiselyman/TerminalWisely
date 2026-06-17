use std::path::{Path, PathBuf};
use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::shell;

#[derive(Debug, Clone)]
pub struct GitBashShell {
    pub bash_exe: PathBuf,
}

pub fn detect_git_bash() -> Option<GitBashShell> {
    for bash in git_bash_candidates() {
        if bash.is_file() {
            return Some(GitBashShell { bash_exe: bash });
        }
    }
    None
}

pub fn home_dir(shell: &GitBashShell) -> AppResult<String> {
    let output = Command::new(&shell.bash_exe)
        .args(["-lc", "printf '%s' \"$HOME\""])
        .output()
        .map_err(|e| AppError::msg(format!("无法读取 Git Bash 用户目录: {e}")))?;
    if !output.status.success() {
        return Err(AppError::msg("无法读取 Git Bash 用户目录"));
    }
    let home = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if home.is_empty() {
        return Err(AppError::msg("Git Bash 用户目录为空"));
    }
    Ok(home)
}

pub fn to_windows_path(bash_exe: &Path, unix_path: &str) -> AppResult<PathBuf> {
    let trimmed = unix_path.trim();
    if trimmed.is_empty() {
        return Err(AppError::msg("路径为空"));
    }
    let quoted = shell::shell_quote_remote_path(trimmed);
    let script = format!("cygpath -w {quoted}");
    let output = Command::new(bash_exe)
        .args(["-lc", &script])
        .output()
        .map_err(|e| AppError::msg(format!("无法转换 Unix 路径: {e}")))?;
    if !output.status.success() {
        return Err(AppError::msg(format!("路径不存在: {trimmed}")));
    }
    let win = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if win.is_empty() {
        return Err(AppError::msg(format!("路径无效: {trimmed}")));
    }
    Ok(PathBuf::from(win))
}

pub fn metadata(bash_exe: &Path, unix_path: &str) -> AppResult<(bool, u64)> {
    let win = to_windows_path(bash_exe, unix_path)?;
    let meta = std::fs::metadata(&win).map_err(|_| AppError::msg(format!("路径不存在: {unix_path}")))?;
    Ok((meta.is_dir(), meta.len()))
}

fn git_bash_candidates() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(pf) = std::env::var("ProgramFiles") {
        paths.push(PathBuf::from(&pf).join("Git").join("bin").join("bash.exe"));
    }
    if let Ok(pf86) = std::env::var("ProgramFiles(x86)") {
        paths.push(PathBuf::from(&pf86).join("Git").join("bin").join("bash.exe"));
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        paths.push(
            PathBuf::from(&local)
                .join("Programs")
                .join("Git")
                .join("bin")
                .join("bash.exe"),
        );
    }
    paths
}

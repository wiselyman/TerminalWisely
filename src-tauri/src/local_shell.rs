use std::path::PathBuf;

use crate::error::{AppError, AppResult};
use crate::types::LocalShellInfo;

#[derive(Debug, Clone)]
pub enum LocalUnixRunner {
    GitBash {
        bash_exe: String,
    },
}

impl LocalUnixRunner {
    #[cfg(windows)]
    pub fn to_windows_path(&self, path: &str) -> AppResult<PathBuf> {
        match self {
            Self::GitBash { bash_exe } => {
                crate::msys::to_windows_path(PathBuf::from(bash_exe).as_path(), path)
            }
        }
    }

    pub fn bash_exe(&self) -> &str {
        match self {
            Self::GitBash { bash_exe } => bash_exe.as_str(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ResolvedLocalShell {
    pub info: LocalShellInfo,
    pub shell_executable: String,
    pub home_dir: String,
    pub title_shell: String,
    pub unix_runner: Option<LocalUnixRunner>,
}

pub fn resolve() -> AppResult<ResolvedLocalShell> {
    #[cfg(windows)]
    {
        let shell = crate::msys::detect_git_bash().ok_or_else(|| {
            AppError::msg("未检测到 Git Bash，请先安装 Git for Windows")
        })?;
        return build_git_bash(&shell);
    }
    #[cfg(not(windows))]
    {
        build_native_unix()
    }
}

pub fn local_shell_info() -> LocalShellInfo {
    #[cfg(windows)]
    {
        if crate::msys::detect_git_bash().is_some() {
            return git_bash_info(true);
        }
        return git_bash_info(false);
    }
    #[cfg(not(windows))]
    {
        let os_name = crate::host::host_os_name();
        LocalShellInfo {
            backend: "native".to_string(),
            os_id: crate::host::host_os_id().to_string(),
            os_name: os_name.to_string(),
            title: format!("{os_name} 本地终端"),
            git_bash_available: false,
        }
    }
}

#[cfg(windows)]
fn git_bash_info(available: bool) -> LocalShellInfo {
    LocalShellInfo {
        backend: "git_bash".to_string(),
        os_id: "linux".to_string(),
        os_name: "Git Bash".to_string(),
        title: "Git Bash 本地终端".to_string(),
        git_bash_available: available,
    }
}

#[cfg(windows)]
fn build_git_bash(shell: &crate::msys::GitBashShell) -> AppResult<ResolvedLocalShell> {
    let home = crate::msys::home_dir(shell)?;
    let bash = shell.bash_exe.to_string_lossy().to_string();
    Ok(ResolvedLocalShell {
        info: git_bash_info(true),
        shell_executable: bash.clone(),
        home_dir: home,
        title_shell: "Git Bash".to_string(),
        unix_runner: Some(LocalUnixRunner::GitBash { bash_exe: bash }),
    })
}

#[cfg(not(windows))]
fn build_native_unix() -> AppResult<ResolvedLocalShell> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    let home_dir = dirs::home_dir()
        .map(|home| home.to_string_lossy().to_string())
        .unwrap_or_else(|| "/".to_string());
    let os_name = crate::host::host_os_name();
    Ok(ResolvedLocalShell {
        info: LocalShellInfo {
            backend: "native".to_string(),
            os_id: crate::host::host_os_id().to_string(),
            os_name: os_name.to_string(),
            title: format!("{os_name} 本地终端"),
            git_bash_available: false,
        },
        shell_executable: shell.clone(),
        home_dir: home_dir.clone(),
        title_shell: shell,
        unix_runner: None,
    })
}

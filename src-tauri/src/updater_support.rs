//! In-app update helpers: version + platform-specific updater target.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)] // constructed on Linux; other OS builds only see Unknown
pub enum LinuxInstallKind {
    AppImage,
    Deb,
    Rpm,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateTargetInfo {
    /// Passed to `@tauri-apps/plugin-updater` `check({ target })`.
    pub target: String,
    pub arch: String,
    pub os: String,
    pub linux_kind: Option<LinuxInstallKind>,
}

pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

pub fn detect_linux_install_kind() -> LinuxInstallKind {
    #[cfg(not(target_os = "linux"))]
    {
        LinuxInstallKind::Unknown
    }
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("APPIMAGE").is_some() {
            return LinuxInstallKind::AppImage;
        }
        let exe = match std::env::current_exe() {
            Ok(p) => p,
            Err(_) => return LinuxInstallKind::Unknown,
        };
        let path = exe.to_string_lossy();

        // Common package install prefixes.
        let under_usr = path.starts_with("/usr/") || path.starts_with("/usr/local/");

        if under_usr {
            if command_succeeds(&["dpkg", "-S", &path]) {
                return LinuxInstallKind::Deb;
            }
            if command_succeeds(&["rpm", "-qf", &path]) {
                return LinuxInstallKind::Rpm;
            }
            // Fallback by package manager presence when path looks installed.
            if which_exists("dpkg") && !which_exists("rpm") {
                return LinuxInstallKind::Deb;
            }
            if which_exists("rpm") && !which_exists("dpkg") {
                return LinuxInstallKind::Rpm;
            }
            if which_exists("dpkg") {
                return LinuxInstallKind::Deb;
            }
            if which_exists("rpm") {
                return LinuxInstallKind::Rpm;
            }
        }

        // Portable / unpacked binary — prefer AppImage channel if available.
        LinuxInstallKind::AppImage
    }
}

pub fn update_target_info() -> UpdateTargetInfo {
    let os = std::env::consts::OS;
    let arch = match std::env::consts::ARCH {
        "x86_64" => "x86_64",
        "aarch64" => "aarch64",
        "x86" | "i686" => "i686",
        "arm" => "armv7",
        other => other,
    }
    .to_string();

    let os_name = match os {
        "macos" => "darwin",
        "windows" => "windows",
        "linux" => "linux",
        other => other,
    }
    .to_string();

    let linux_kind = if os == "linux" {
        Some(detect_linux_install_kind())
    } else {
        None
    };

    let target = match linux_kind {
        Some(LinuxInstallKind::Deb) => format!("{os_name}-{arch}-deb"),
        Some(LinuxInstallKind::Rpm) => format!("{os_name}-{arch}-rpm"),
        // AppImage + unknown use the default linux-{arch} slot (AppImage URL).
        Some(LinuxInstallKind::AppImage) | Some(LinuxInstallKind::Unknown) | None => {
            format!("{os_name}-{arch}")
        }
    };

    UpdateTargetInfo {
        target,
        arch,
        os: os_name,
        linux_kind,
    }
}

#[cfg(target_os = "linux")]
fn which_exists(bin: &str) -> bool {
    std::process::Command::new("which")
        .arg(bin)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(target_os = "linux")]
fn command_succeeds(args: &[&str]) -> bool {
    if args.is_empty() {
        return false;
    }
    std::process::Command::new(args[0])
        .args(&args[1..])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_target_has_os_arch() {
        let info = update_target_info();
        assert!(!info.target.is_empty());
        assert!(!info.arch.is_empty());
        assert!(!info.os.is_empty());
        assert!(info.target.contains(&info.arch));
    }
}

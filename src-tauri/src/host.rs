use crate::local_shell;

pub fn host_os_id() -> &'static str {
    #[cfg(windows)]
    {
        return "windows";
    }
    #[cfg(target_os = "macos")]
    {
        return "macos";
    }
    #[cfg(target_os = "linux")]
    {
        return "linux";
    }
    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        "linux"
    }
}

pub fn host_os_name() -> &'static str {
    #[cfg(windows)]
    {
        return "Windows";
    }
    #[cfg(target_os = "macos")]
    {
        return "macOS";
    }
    #[cfg(target_os = "linux")]
    {
        return "Linux";
    }
    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        "Linux"
    }
}

pub fn local_shell_info() -> crate::types::LocalShellInfo {
    local_shell::local_shell_info()
}

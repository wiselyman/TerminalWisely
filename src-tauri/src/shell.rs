pub fn shell_quote_remote_path(value: &str) -> String {
    shell_single_quote(value)
}

fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn is_safe_unquoted_segment(segment: &str) -> bool {
    !segment.is_empty()
        && segment.chars().all(|c| {
            c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.'
        })
}

fn is_safe_unquoted_path(path: &str) -> bool {
    !path.is_empty()
        && !path.split('/').any(|segment| segment == "..")
        && path.split('/').all(is_safe_unquoted_segment)
}

/// Shell word for `cd`: keep a leading `~` outside quotes so bash expands home.
pub fn shell_cd_argument(value: &str) -> String {
    if value == "~" {
        return "~".to_string();
    }

    if let Some(rest) = value.strip_prefix("~/") {
        if rest.is_empty() {
            return "~".to_string();
        }
        if is_safe_unquoted_path(rest) {
            return format!("~/{}", rest);
        }
        return format!("~/{}", shell_single_quote(rest));
    }

    if is_safe_unquoted_path(value) {
        return value.to_string();
    }

    shell_single_quote(value)
}

pub fn extract_shell_command(text: &str) -> Option<String> {
    text
        .split(['\r', '\n'])
        .last()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| line.to_string())
}

pub fn apply_cd_target(cwd: &mut String, home: &str, target: &str) {
    if uses_unix_path_semantics(home) {
        apply_cd_target_unix(cwd, home, target);
        return;
    }

    use std::path::{Path, PathBuf};

    let target = target.trim().trim_matches('"');
    if target.is_empty() {
        *cwd = home.to_string();
        return;
    }

    #[cfg(windows)]
    if target.eq_ignore_ascii_case("%USERPROFILE%") {
        *cwd = home.to_string();
        return;
    }

    if target == "~" {
        *cwd = home.to_string();
        return;
    }

    let home_path = PathBuf::from(home);
    if target.starts_with("~/") || target.starts_with("~\\") {
        let rest = target.trim_start_matches('~').trim_start_matches(['/', '\\']);
        *cwd = home_path.join(rest).to_string_lossy().to_string();
        return;
    }

    if Path::new(target).is_absolute() {
        *cwd = target.to_string();
        return;
    }

    if target == ".." {
        let parent = PathBuf::from(cwd.as_str())
            .parent()
            .unwrap_or(home_path.as_path())
            .to_string_lossy()
            .to_string();
        *cwd = parent;
        return;
    }

    if target == "." {
        return;
    }

    *cwd = PathBuf::from(cwd.as_str())
        .join(target)
        .to_string_lossy()
        .to_string();
}

fn extract_cd_target(cmd: &str) -> Option<String> {
    let trimmed = cmd.trim();
    let lower = trimmed.to_lowercase();
    let rest = if lower.starts_with("set-location ") {
        trimmed["set-location ".len()..].trim()
    } else if lower.starts_with("cd") {
        let mut rest = trimmed[2..].trim();
        if rest.len() >= 2 && rest.as_bytes()[0] == b'/' && rest.as_bytes()[1] == b'd'
            && rest.as_bytes().get(2).copied() == Some(b' ')
        {
            rest = rest[3..].trim();
        }
        rest
    } else {
        return None;
    };

    if rest.is_empty() {
        return Some(String::new());
    }

    let target = rest
        .split(['&', ';', '|'])
        .next()
        .unwrap_or(rest)
        .trim()
        .trim_matches('"');

    #[cfg(windows)]
    if target.eq_ignore_ascii_case("%USERPROFILE%") {
        return Some("~".to_string());
    }

    Some(target.to_string())
}

pub fn update_cwd_from_input(cwd: &mut String, home: &str, data: &str) {
    if !(data.contains('\r') || data.contains('\n')) {
        return;
    }
    let Some(cmd) = extract_shell_command(data) else {
        return;
    };
    let Some(target) = extract_cd_target(&cmd) else {
        return;
    };
    apply_cd_target(cwd, home, &target);
}

pub fn path_for_display(home: &str, absolute: &str) -> String {
    use std::path::PathBuf;

    if uses_unix_path_semantics(home) {
        return path_for_display_unix(home, absolute);
    }

    let home_path = PathBuf::from(home);
    let abs_path = PathBuf::from(absolute);

    #[cfg(windows)]
    {
        let home_norm = home_path.to_string_lossy().trim_end_matches('\\').to_string();
        let abs_norm = abs_path.to_string_lossy().to_string();
        if abs_norm.eq_ignore_ascii_case(&home_norm) {
            return "~".to_string();
        }
        let prefix = format!("{}\\", home_norm);
        if abs_norm.len() > prefix.len() && abs_norm[..prefix.len()].eq_ignore_ascii_case(&prefix)
        {
            let suffix = abs_norm[prefix.len()..].replace('\\', "/");
            return if suffix.is_empty() {
                "~".to_string()
            } else {
                format!("~/{suffix}")
            };
        }
        return absolute.to_string();
    }

    #[cfg(not(windows))]
    {
        let home = home.trim_end_matches('/');
        if absolute == home {
            return "~".to_string();
        }
        let prefix = format!("{home}/");
        if absolute.starts_with(&prefix) {
            return format!("~{}", &absolute[home.len()..]);
        }
        absolute.to_string()
    }
}

#[cfg(windows)]
pub fn windows_cd_and_list_command(shell: &str, path: &str) -> String {
    let quoted = windows_path_argument(path);
    if is_powershell(shell) {
        format!("Set-Location {quoted}; Get-ChildItem\r")
    } else {
        format!("cd /d {quoted} && dir\r")
    }
}

#[cfg(windows)]
fn is_powershell(shell: &str) -> bool {
    let lower = shell.to_lowercase();
    lower.contains("powershell") || lower.contains("pwsh")
}

#[cfg(windows)]
pub fn windows_path_argument(path: &str) -> String {
    format!("\"{}\"", path.replace('"', ""))
}

pub fn resolve_local_path(
    path: &str,
    home: &str,
    cwd: &str,
) -> crate::error::AppResult<std::path::PathBuf> {
    use std::path::{Path, PathBuf};

    use crate::error::AppError;

    let trimmed = path.trim().trim_end_matches(['/', '\\']);
    if trimmed.is_empty() {
        return Err(AppError::msg("路径为空"));
    }

    if uses_unix_path_semantics(home) {
        return Ok(PathBuf::from(resolve_unix_path(home, cwd, trimmed)));
    }

    if trimmed.starts_with('~') {
        return expand_tilde_path(home, trimmed);
    }

    if Path::new(trimmed).is_absolute() {
        let candidate = PathBuf::from(trimmed);
        if candidate.exists() {
            return Ok(candidate);
        }
        return Err(AppError::msg(format!("路径不存在: {trimmed}")));
    }

    let joined = PathBuf::from(cwd).join(trimmed);
    if joined.exists() {
        return Ok(joined);
    }
    if let Ok(canonical) = joined.canonicalize() {
        return Ok(canonical);
    }

    Err(AppError::msg(format!("路径不存在: {trimmed}")))
}

fn expand_tilde_path(home: &str, path: &str) -> crate::error::AppResult<std::path::PathBuf> {
    use std::path::PathBuf;

    use crate::error::AppError;

    if path == "~" {
        return Ok(PathBuf::from(home));
    }
    if path.starts_with("~/") || path.starts_with("~\\") {
        let rest = path.trim_start_matches('~').trim_start_matches(['/', '\\']);
        let candidate = PathBuf::from(home).join(rest);
        if candidate.exists() {
            return Ok(candidate);
        }
        return Err(AppError::msg(format!("路径不存在: {path}")));
    }
    Ok(PathBuf::from(path))
}

fn uses_unix_path_semantics(home: &str) -> bool {
    home.starts_with('/') && !home.starts_with("//")
}

fn apply_cd_target_unix(cwd: &mut String, home: &str, target: &str) {
    let target = target.trim().trim_matches('"');
    if target.is_empty() || target == "~" {
        *cwd = home.to_string();
        return;
    }

    if target.starts_with("~/") {
        let rest = target.trim_start_matches("~/");
        *cwd = join_unix_path(home, rest);
        return;
    }

    if target.starts_with('/') {
        *cwd = normalize_unix_path(target);
        return;
    }

    if target == ".." {
        *cwd = parent_unix_path(cwd, home);
        return;
    }

    if target == "." {
        return;
    }

    *cwd = join_unix_path(cwd, target);
}

fn path_for_display_unix(home: &str, absolute: &str) -> String {
    let home = home.trim_end_matches('/');
    if absolute == home {
        return "~".to_string();
    }
    let prefix = format!("{home}/");
    if absolute.starts_with(&prefix) {
        return format!("~{}", &absolute[home.len()..]);
    }
    absolute.to_string()
}

fn resolve_unix_path(home: &str, cwd: &str, path: &str) -> String {
    if path == "~" {
        return home.to_string();
    }
    if path.starts_with("~/") {
        return join_unix_path(home, path.trim_start_matches("~/"));
    }
    if path.starts_with('/') {
        return normalize_unix_path(path);
    }
    join_unix_path(cwd, path)
}

fn join_unix_path(base: &str, segment: &str) -> String {
    let base = base.trim_end_matches('/');
    let segment = segment.trim_matches('/');
    if segment.is_empty() {
        return base.to_string();
    }
    normalize_unix_path(&format!("{base}/{segment}"))
}

fn parent_unix_path(path: &str, home: &str) -> String {
    let trimmed = path.trim_end_matches('/');
    if trimmed.is_empty() || trimmed == home.trim_end_matches('/') {
        return home.to_string();
    }
    if let Some((parent, _)) = trimmed.rsplit_once('/') {
        if parent.is_empty() {
            return "/".to_string();
        }
        return parent.to_string();
    }
    home.to_string()
}

fn normalize_unix_path(path: &str) -> String {
    let mut parts = Vec::new();
    for part in path.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            parts.pop();
            continue;
        }
        parts.push(part);
    }
    if path.starts_with('/') {
        format!("/{}", parts.join("/"))
    } else {
        parts.join("/")
    }
}

#[cfg(test)]
mod tests {
    use super::{apply_cd_target, extract_cd_target, shell_cd_argument};

    #[test]
    fn tilde_path_stays_unquoted() {
        assert_eq!(shell_cd_argument("~/Download"), "~/Download");
        assert_eq!(shell_cd_argument("~/dataset/weeder_yolo"), "~/dataset/weeder_yolo");
    }

    #[test]
    fn tilde_only() {
        assert_eq!(shell_cd_argument("~"), "~");
    }

    #[test]
    fn spaces_after_tilde_are_quoted() {
        assert_eq!(shell_cd_argument("~/my dir"), "~/'my dir'");
    }

    #[test]
    fn absolute_and_relative_safe_paths() {
        assert_eq!(shell_cd_argument("/var/log"), "/var/log");
        assert_eq!(shell_cd_argument("Download"), "Download");
    }

    #[test]
    fn apply_cd_parent_windows_style() {
        let mut cwd = r"C:\Users\alice\Documents".to_string();
        apply_cd_target(&mut cwd, r"C:\Users\alice", "..");
        assert_eq!(cwd, r"C:\Users\alice");
    }

    #[test]
    fn extract_cd_target_cmd_with_chain() {
        assert_eq!(
            extract_cd_target(r#"cd /d "C:\Users\alice" && dir"#),
            Some(r"C:\Users\alice".to_string())
        );
        assert_eq!(
            extract_cd_target("cd %USERPROFILE%; dir"),
            Some("~".to_string())
        );
    }
}

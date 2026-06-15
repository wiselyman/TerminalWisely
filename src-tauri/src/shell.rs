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
    if target.is_empty() {
        *cwd = home.to_string();
        return;
    }
    if target.starts_with('/') {
        *cwd = target.to_string();
        return;
    }
    if target == "~" {
        *cwd = home.to_string();
        return;
    }
    if target.starts_with("~/") {
        *cwd = format!("{}/{}", home.trim_end_matches('/'), &target[2..]);
        return;
    }
    if target == ".." {
        let trimmed = cwd.trim_end_matches('/');
        if trimmed.is_empty() || trimmed == "/" {
            *cwd = "/".to_string();
            return;
        }
        if let Some((parent, _)) = trimmed.rsplit_once('/') {
            *cwd = if parent.is_empty() {
                "/".to_string()
            } else {
                parent.to_string()
            };
        } else {
            *cwd = "/".to_string();
        }
        return;
    }
    *cwd = format!("{}/{}", cwd.trim_end_matches('/'), target);
}

pub fn update_cwd_from_input(cwd: &mut String, home: &str, data: &str) {
    if !(data.contains('\r') || data.contains('\n')) {
        return;
    }
    let Some(cmd) = extract_shell_command(data) else {
        return;
    };
    if cmd == "cd" {
        *cwd = home.to_string();
        return;
    }
    if let Some(target) = cmd.strip_prefix("cd ") {
        apply_cd_target(cwd, home, target.trim());
    }
}

pub fn path_for_display(home: &str, absolute: &str) -> String {
    let home = home.trim_end_matches('/');
    if absolute == home {
        return "~".to_string();
    }
    let prefix = format!("{}/", home);
    if absolute.starts_with(&prefix) {
        return format!("~{}", &absolute[home.len()..]);
    }
    absolute.to_string()
}

pub fn resolve_local_path(
    path: &str,
    home: &str,
    cwd: &str,
) -> crate::error::AppResult<std::path::PathBuf> {
    use std::path::{Path, PathBuf};

    use crate::error::{AppError, AppResult};

    let trimmed = path.trim().trim_end_matches(['/', '\\']);
    if trimmed.is_empty() {
        return Err(AppError::msg("路径为空"));
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

    use crate::error::{AppError, AppResult};

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

#[cfg(test)]
mod tests {
    use super::shell_cd_argument;

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
}

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

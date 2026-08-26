mod remote;

pub use remote::complete_remote_path_from_partial;

const MAX_COMPLETIONS: usize = 80;

pub fn split_path_prefix(partial: &str) -> (String, String) {
    if partial.is_empty() {
        return (String::new(), String::new());
    }
    if partial.ends_with('/') || partial.ends_with('\\') {
        return (partial.to_string(), String::new());
    }
    if let Some(idx) = partial.rfind(['/', '\\']) {
        let (dir, rest) = partial.split_at(idx + 1);
        (dir.to_string(), rest.to_string())
    } else {
        (String::new(), partial.to_string())
    }
}

pub fn build_completions(
    dir_display_base: &str,
    entries: &[(String, bool)],
    prefix: &str,
) -> Vec<String> {
    let mut matches: Vec<String> = entries
        .iter()
        .filter(|(name, _)| {
            !name.is_empty()
                && name != "."
                && name != ".."
                && (prefix.is_empty() || name.starts_with(prefix))
        })
        .map(|(name, is_dir)| build_completion_path(dir_display_base, name, *is_dir))
        .collect();

    matches.sort_by(|a, b| {
        let a_dir = a.ends_with('/');
        let b_dir = b.ends_with('/');
        match b_dir.cmp(&a_dir) {
            std::cmp::Ordering::Equal => a.cmp(b),
            other => other,
        }
    });
    matches.dedup();
    matches.truncate(MAX_COMPLETIONS);
    matches
}

fn build_completion_path(base: &str, name: &str, is_dir: bool) -> String {
    let entry = if is_dir {
        format!("{name}/")
    } else {
        name.to_string()
    };
    if base.is_empty() {
        return entry;
    }
    if base.ends_with('/') || base.ends_with('\\') {
        format!("{base}{entry}")
    } else {
        format!("{base}/{entry}")
    }
}

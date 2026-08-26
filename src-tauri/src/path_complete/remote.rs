use crate::error::AppResult;
use crate::fs_remote::list_remote_directory_entries;
use crate::path_complete::{build_completions, split_path_prefix};
use crate::ssh::client::SshSessionSnapshot;

pub async fn complete_remote_path(
    ssh: SshSessionSnapshot,
    dir_part: &str,
    prefix: &str,
) -> AppResult<Vec<String>> {
    let resolved_dir = if dir_part.is_empty() {
        ssh.current_remote_cwd().await
    } else {
        ssh.resolve_remote_path(dir_part.trim_end_matches(['/', '\\']))
            .await?
    };

    // Include dotfiles when the user is completing a hidden-name prefix.
    let show_hidden = prefix.starts_with('.');
    let entries: Vec<(String, bool)> =
        match list_remote_directory_entries(&ssh.handle(), &resolved_dir, show_hidden).await {
            Ok(entries) => entries
                .into_iter()
                .map(|entry| (entry.name, entry.is_dir))
                .collect(),
            Err(_) => return Ok(Vec::new()),
        };

    Ok(build_completions(dir_part, &entries, prefix))
}

pub async fn complete_remote_path_from_partial(
    ssh: SshSessionSnapshot,
    partial: &str,
) -> AppResult<Vec<String>> {
    let (dir_part, prefix) = split_path_prefix(partial);
    complete_remote_path(ssh, &dir_part, &prefix).await
}

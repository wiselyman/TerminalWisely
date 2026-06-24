use crate::error::AppResult;
use crate::path_complete::{build_completions, split_path_prefix};
use crate::ssh::client::SshSessionSnapshot;
use crate::ssh::sftp;

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

    let entries = match sftp::list_remote_directory(&ssh.handle(), &resolved_dir).await {
        Ok(entries) => entries,
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

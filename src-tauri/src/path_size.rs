use std::path::Path;
use std::sync::Arc;

use tokio::sync::Mutex;

use russh::client;

use crate::error::{AppError, AppResult};
use crate::preview_sudo;
use crate::shell::shell_quote_remote_path;
use crate::ssh::client::{exec_command, ClientHandler};
use crate::ssh::sftp;

pub async fn local_path_size(path: &Path) -> AppResult<(bool, u64)> {
    let meta = tokio::fs::metadata(path).await?;
    if meta.is_file() {
        return Ok((false, meta.len()));
    }
    if !meta.is_dir() {
        return Err(AppError::msg("无法识别路径类型"));
    }
    Ok((true, local_dir_size(path).await?))
}

async fn local_dir_size(path: &Path) -> AppResult<u64> {
    let mut total = 0u64;
    let mut stack = vec![path.to_path_buf()];

    while let Some(current) = stack.pop() {
        let mut read_dir = tokio::fs::read_dir(&current).await?;
        while let Some(entry) = read_dir.next_entry().await? {
            let entry_path = entry.path();
            let meta = entry.metadata().await?;
            if meta.is_dir() {
                stack.push(entry_path);
            } else if meta.is_file() {
                total = total.saturating_add(meta.len());
            }
        }
    }

    Ok(total)
}

async fn remote_du_bytes(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    resolved: &str,
    sudo_password: Option<&str>,
) -> AppResult<u64> {
    let quoted = shell_quote_remote_path(resolved);
    let shell_command = format!("du -sb {quoted} 2>/dev/null | awk '{{print $1}}'");

    let output = match exec_command(handle, &shell_command).await {
        Ok(stdout) if !stdout.trim().is_empty() => stdout,
        Ok(_) | Err(_) => {
            preview_sudo::exec_remote_sudo_capture(
                handle,
                &shell_command,
                sudo_password,
                "查看大小",
                resolved,
            )
            .await?
        }
    };

    parse_size_output(&output)
}

async fn remote_file_bytes(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    resolved: &str,
    sudo_password: Option<&str>,
) -> AppResult<u64> {
    match sftp::remote_file_size(handle, resolved).await {
        Ok(size) => return Ok(size),
        Err(err) if !preview_sudo::is_permission_denied(&err) => return Err(err),
        Err(_) => {}
    }

    let quoted = shell_quote_remote_path(resolved);
    let shell_command = format!("stat -c %s {quoted} 2>/dev/null || stat -f %z {quoted}");
    let output = preview_sudo::exec_remote_sudo_capture(
        handle,
        &shell_command,
        sudo_password,
        "查看大小",
        resolved,
    )
    .await?;

    parse_size_output(&output)
}

pub async fn remote_path_size(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    resolved: &str,
    is_dir: bool,
    sudo_password: Option<&str>,
) -> AppResult<u64> {
    if is_dir {
        remote_du_bytes(handle, resolved, sudo_password).await
    } else {
        remote_file_bytes(handle, resolved, sudo_password).await
    }
}

fn parse_size_output(output: &str) -> AppResult<u64> {
    output
        .split_whitespace()
        .next()
        .ok_or_else(|| AppError::msg("无法解析文件大小"))?
        .parse::<u64>()
        .map_err(|_| AppError::msg("无法解析文件大小"))
}

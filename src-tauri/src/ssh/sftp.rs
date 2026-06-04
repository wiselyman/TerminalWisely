use std::path::Path;
use std::sync::Arc;

use russh::client;
use russh::ChannelMsg;
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::OpenFlags;
use russh_sftp::protocol::FileType;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::ssh::client::ClientHandler;

pub async fn resolve_remote_home(
    handle: &client::Handle<ClientHandler>,
) -> AppResult<String> {
    let mut channel = handle.channel_open_session().await?;
    channel.exec(true, "echo $HOME").await?;

    let mut output = Vec::new();
    while let Some(msg) = channel.wait().await {
        match msg {
            ChannelMsg::Data { data } => output.extend_from_slice(&data),
            ChannelMsg::ExitStatus { .. } | ChannelMsg::Close | ChannelMsg::Eof => break,
            _ => {}
        }
    }

    let home = String::from_utf8_lossy(&output).trim().to_string();
    if home.is_empty() {
        Ok("/home".to_string())
    } else {
        Ok(home)
    }
}

pub async fn upload_file<F>(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    local_path: &Path,
    remote_path: &str,
    mut on_progress: F,
) -> AppResult<()>
where
    F: FnMut(u64),
{
    let mut local_file = tokio::fs::File::open(local_path).await?;
    let metadata = local_file.metadata().await?;
    let total = metadata.len();
    let mut transferred = 0u64;

    let handle_guard = handle.lock().await;
    let channel = handle_guard.channel_open_session().await?;
    channel.request_subsystem(true, "sftp").await?;
    let sftp = SftpSession::new(channel.into_stream()).await?;

    let mut remote_file = sftp
        .open_with_flags(
            remote_path.to_string(),
            OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
        )
        .await
        .map_err(AppError::from)?;

    let mut buffer = vec![0u8; 32 * 1024];
    loop {
        let read = local_file.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        remote_file.write_all(&buffer[..read]).await?;
        transferred += read as u64;
        on_progress(transferred.min(total));
    }

    remote_file.shutdown().await.ok();
    Ok(())
}

pub async fn is_remote_directory(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    remote_path: &str,
) -> AppResult<bool> {
    let handle_guard = handle.lock().await;
    let channel = handle_guard.channel_open_session().await?;
    channel.request_subsystem(true, "sftp").await?;
    let sftp = SftpSession::new(channel.into_stream()).await?;
    let metadata = sftp.metadata(remote_path.to_string()).await?;
    Ok(metadata.file_type() == FileType::Dir)
}

pub async fn download_file<F>(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    remote_path: &str,
    local_path: &Path,
    mut on_progress: F,
) -> AppResult<()>
where
    F: FnMut(u64, u64),
{
    let handle_guard = handle.lock().await;
    let channel = handle_guard.channel_open_session().await?;
    channel.request_subsystem(true, "sftp").await?;
    let sftp = SftpSession::new(channel.into_stream()).await?;

    let metadata = sftp.metadata(remote_path.to_string()).await?;
    let total = metadata.size.unwrap_or(0);

    let mut remote_file = sftp
        .open_with_flags(remote_path.to_string(), OpenFlags::READ)
        .await?;
    let mut local_file = tokio::fs::File::create(local_path).await?;
    let mut transferred = 0u64;
    let mut buffer = vec![0u8; 32 * 1024];

    loop {
        let read = remote_file.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        local_file.write_all(&buffer[..read]).await?;
        transferred += read as u64;
        on_progress(transferred, total);
    }

    local_file.flush().await?;
    remote_file.shutdown().await.ok();
    Ok(())
}

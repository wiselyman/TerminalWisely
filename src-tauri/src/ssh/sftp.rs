use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use russh::client;
use russh::ChannelMsg;
use russh_sftp::client::{Config as SftpConfig, SftpSession};
use russh_sftp::protocol::OpenFlags;
use russh_sftp::protocol::FileType;
use std::time::Duration;

use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::sync::{mpsc, Mutex};

use crate::error::{AppError, AppResult};
use crate::ssh::client::ClientHandler;
use crate::transfer::{check_cancel, CANCELLED_MSG, ThrottledProgress, ThrottledProgressBytes};

use crate::transfer::CANCEL_POLL_MS;
const SFTP_CHUNK_SIZE: usize = 2 * 1024 * 1024;
const SFTP_PIPELINE_DEPTH: usize = 4;
const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(120);

fn transfer_sftp_config() -> SftpConfig {
    SftpConfig {
        max_packet_len: 1024 * 1024,
        max_concurrent_writes: 16,
        request_timeout_secs: 30,
    }
}

async fn open_sftp_session(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
) -> AppResult<SftpSession> {
    open_sftp_session_with_config(handle, None).await
}

async fn open_sftp_session_with_config(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    config: Option<SftpConfig>,
) -> AppResult<SftpSession> {
    let handle_guard = handle.lock().await;
    let channel = handle_guard.channel_open_session().await?;
    channel.request_subsystem(true, "sftp").await?;
    let stream = channel.into_stream();
    drop(handle_guard);

    match config {
        Some(cfg) => SftpSession::new_with_config(stream, cfg)
            .await
            .map_err(AppError::from),
        None => SftpSession::new(stream).await.map_err(AppError::from),
    }
}

async fn read_chunk<R: AsyncRead + Unpin>(
    reader: &mut R,
    buf: &mut [u8],
    cancel: Option<&AtomicBool>,
) -> AppResult<usize> {
    let mut filled = 0;
    while filled < buf.len() {
        let n = if let Some(cancel) = cancel {
            tokio::select! {
                read_res = reader.read(&mut buf[filled..]) => match read_res {
                    Ok(n) => n,
                    Err(err) => return Err(err.into()),
                },
                _ = tokio::time::sleep(Duration::from_millis(CANCEL_POLL_MS)) => {
                    if cancel.load(Ordering::SeqCst) {
                        return Err(AppError::msg(CANCELLED_MSG));
                    }
                    continue;
                }
            }
        } else {
            reader.read(&mut buf[filled..]).await?
        };

        if n == 0 {
            break;
        }
        filled += n;
    }
    Ok(filled)
}

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

pub async fn remote_file_size(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    remote_path: &str,
) -> AppResult<u64> {
    let sftp = open_sftp_session(handle).await?;
    let metadata = sftp.metadata(remote_path.to_string()).await?;
    Ok(metadata.size.unwrap_or(0))
}

pub async fn read_remote_file_bytes(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    remote_path: &str,
    max_bytes: usize,
) -> AppResult<(Vec<u8>, u64)> {
    let sftp = open_sftp_session(handle).await?;
    let metadata = sftp.metadata(remote_path.to_string()).await?;
    let total = metadata.size.unwrap_or(0);

    let mut remote_file = sftp
        .open_with_flags(remote_path.to_string(), OpenFlags::READ)
        .await?;

    let mut buffer = vec![0u8; max_bytes];
    let read = read_chunk(&mut remote_file, &mut buffer, None).await?;
    buffer.truncate(read);
    Ok((buffer, total))
}

pub async fn write_remote_bytes(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    remote_path: &str,
    data: &[u8],
) -> AppResult<()> {
    let sftp = open_sftp_session(handle).await?;
    let mut remote_file = sftp
        .open_with_flags(
            remote_path.to_string(),
            OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
        )
        .await
        .map_err(AppError::from)?;
    remote_file
        .write_all(data)
        .await
        .map_err(AppError::from)?;
    remote_file.shutdown().await.ok();
    Ok(())
}

pub async fn remove_remote_file(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    remote_path: &str,
) -> AppResult<()> {
    let sftp = open_sftp_session(handle).await?;
    sftp.remove_file(remote_path.to_string()).await?;
    Ok(())
}

pub async fn upload_file<F>(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    local_path: &Path,
    remote_path: &str,
    cancel: Option<Arc<AtomicBool>>,
    on_progress: F,
) -> AppResult<()>
where
    F: FnMut(u64),
{
    let mut local_file = tokio::fs::File::open(local_path).await?;
    let metadata = local_file.metadata().await?;
    let total = metadata.len();
    let mut transferred = 0u64;
    let mut progress = ThrottledProgressBytes::new(on_progress, PROGRESS_EMIT_INTERVAL);

    let sftp = open_sftp_session_with_config(handle, Some(transfer_sftp_config())).await?;

    let mut remote_file = sftp
        .open_with_flags(
            remote_path.to_string(),
            OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
        )
        .await
        .map_err(AppError::from)?;

    let mut buffer = vec![0u8; SFTP_CHUNK_SIZE];
    let mut buf_b = vec![0u8; SFTP_CHUNK_SIZE];
    let mut pending_len = read_chunk(&mut local_file, &mut buffer, cancel.as_deref()).await?;
    let mut read_into_primary = false;

    while pending_len > 0 {
        let (write_slice, read_buf) = if read_into_primary {
            (&buf_b[..pending_len], &mut buffer)
        } else {
            (&buffer[..pending_len], &mut buf_b)
        };

        let (next_len, write_res) = tokio::join!(
            read_chunk(&mut local_file, read_buf, cancel.as_deref()),
            remote_file.write_all(write_slice)
        );
        write_res.map_err(AppError::from)?;
        transferred += pending_len as u64;
        progress.report(transferred.min(total), false);
        pending_len = next_len?;
        read_into_primary = !read_into_primary;
    }

    progress.report(transferred.min(total), true);
    remote_file.shutdown().await.ok();
    Ok(())
}

pub async fn is_remote_directory(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    remote_path: &str,
) -> AppResult<bool> {
    let sftp = open_sftp_session(handle).await?;
    let metadata = sftp.metadata(remote_path.to_string()).await?;
    Ok(metadata.file_type() == FileType::Dir)
}

pub async fn download_file<F>(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    remote_path: &str,
    local_path: &Path,
    cancel: Option<Arc<AtomicBool>>,
    on_progress: F,
) -> AppResult<()>
where
    F: FnMut(u64, u64),
{
    check_cancel(cancel.as_deref())?;

    let sftp = open_sftp_session_with_config(handle, Some(transfer_sftp_config())).await?;
    check_cancel(cancel.as_deref())?;

    let metadata = sftp.metadata(remote_path.to_string()).await?;
    check_cancel(cancel.as_deref())?;
    let total = metadata.size.unwrap_or(0);

    let mut remote_file = sftp
        .open_with_flags(remote_path.to_string(), OpenFlags::READ)
        .await?;
    check_cancel(cancel.as_deref())?;
    let mut local_file = tokio::fs::File::create(local_path).await?;
    let mut transferred = 0u64;
    let mut progress = ThrottledProgress::new(on_progress, PROGRESS_EMIT_INTERVAL);
    progress.report(0, total, true);
    let mut buffer = vec![0u8; SFTP_CHUNK_SIZE];
    let mut buf_b = vec![0u8; SFTP_CHUNK_SIZE];
    let mut pending_len = read_chunk(&mut remote_file, &mut buffer, cancel.as_deref()).await?;
    let mut read_into_primary = false;

    while pending_len > 0 {
        let (write_slice, read_buf) = if read_into_primary {
            (&buf_b[..pending_len], &mut buffer)
        } else {
            (&buffer[..pending_len], &mut buf_b)
        };

        let (next_len, write_res) = tokio::join!(
            read_chunk(&mut remote_file, read_buf, cancel.as_deref()),
            local_file.write_all(write_slice)
        );
        write_res?;
        transferred += pending_len as u64;
        progress.report(transferred, total, false);
        pending_len = next_len?;
        read_into_primary = !read_into_primary;
    }

    local_file.flush().await?;
    progress.report(transferred, total, true);
    remote_file.shutdown().await.ok();
    Ok(())
}

pub async fn transfer_remote_file<F>(
    from_handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    to_handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    from_path: &str,
    to_path: &str,
    cancel: Option<Arc<AtomicBool>>,
    on_progress: F,
) -> AppResult<()>
where
    F: FnMut(u64, u64),
{
    let from_sftp =
        open_sftp_session_with_config(from_handle, Some(transfer_sftp_config())).await?;
    let to_sftp = open_sftp_session_with_config(to_handle, Some(transfer_sftp_config())).await?;

    let metadata = from_sftp.metadata(from_path.to_string()).await?;
    if metadata.file_type() == FileType::Dir {
        return Err(AppError::msg("请选择文件，不能发送目录"));
    }
    let total = metadata.size.unwrap_or(0);

    let mut reader = from_sftp
        .open_with_flags(from_path.to_string(), OpenFlags::READ)
        .await
        .map_err(AppError::from)?;
    let mut writer = to_sftp
        .open_with_flags(
            to_path.to_string(),
            OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
        )
        .await
        .map_err(AppError::from)?;

    let mut transferred = 0u64;
    let mut progress = ThrottledProgress::new(on_progress, PROGRESS_EMIT_INTERVAL);

    let (chunk_tx, mut chunk_rx) = mpsc::channel::<Vec<u8>>(SFTP_PIPELINE_DEPTH);
    let read_cancel = cancel.clone();
    let read_task = tokio::spawn(async move {
        let mut read_result = Ok(());
        loop {
            let chunk = match async {
                check_cancel(read_cancel.as_deref())?;
                let mut buf = vec![0u8; SFTP_CHUNK_SIZE];
                let n = read_chunk(&mut reader, &mut buf, read_cancel.as_deref()).await?;
                if n == 0 {
                    return Ok(None);
                }
                buf.truncate(n);
                Ok(Some(buf))
            }
            .await
            {
                Ok(None) => break,
                Ok(Some(buf)) => buf,
                Err(err) => {
                    read_result = Err(err);
                    break;
                }
            };

            if chunk_tx.send(chunk).await.is_err() {
                break;
            }
        }
        reader.shutdown().await.ok();
        read_result
    });

    while let Some(chunk) = chunk_rx.recv().await {
        check_cancel(cancel.as_deref())?;
        writer.write_all(&chunk).await.map_err(AppError::from)?;
        transferred += chunk.len() as u64;
        progress.report(transferred, total, false);
    }

    match read_task.await {
        Ok(Ok(())) => {}
        Ok(Err(err)) => return Err(err),
        Err(err) => return Err(AppError::msg(err.to_string())),
    }

    progress.report(transferred, total, true);
    writer.shutdown().await.ok();
    Ok(())
}

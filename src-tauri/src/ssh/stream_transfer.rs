use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use russh::client;
use russh::ChannelMsg;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::sync::{mpsc, Mutex};

use crate::error::{AppError, AppResult};
use crate::shell::shell_quote_remote_path;
use crate::ssh::client::ClientHandler;
use crate::transfer::{check_cancel, CANCELLED_MSG, ThrottledProgress};

const STREAM_CHUNK_SIZE: usize = 2 * 1024 * 1024;
const STREAM_PIPELINE_DEPTH: usize = 4;
const CANCEL_POLL_MS: u64 = 200;
const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(120);

async fn open_exec_channel(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    command: String,
) -> AppResult<russh::Channel<client::Msg>> {
    let channel = {
        let handle_guard = handle.lock().await;
        handle_guard
            .channel_open_session()
            .await
            .map_err(AppError::from)?
    };
    channel
        .exec(true, command)
        .await
        .map_err(AppError::from)?;
    Ok(channel)
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

async fn wait_channel_success(channel: &mut russh::Channel<client::Msg>) -> AppResult<()> {
    let mut exit_status: Option<u32> = None;
    while let Some(msg) = channel.wait().await {
        match msg {
            ChannelMsg::ExitStatus { exit_status: code } => exit_status = Some(code),
            ChannelMsg::Close | ChannelMsg::Eof => break,
            _ => {}
        }
    }

    match exit_status {
        Some(0) => Ok(()),
        Some(code) => Err(AppError::msg(format!("远程命令失败，退出码 {code}"))),
        None => Ok(()),
    }
}

/// Stream relay A → local → B using remote `cat`, similar to scp throughput.
pub async fn transfer_remote_file<F>(
    from_handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    to_handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    from_path: &str,
    to_path: &str,
    total: u64,
    cancel: Option<Arc<AtomicBool>>,
    on_progress: F,
) -> AppResult<()>
where
    F: FnMut(u64, u64),
{
    let quoted_from = shell_quote_remote_path(from_path);
    let quoted_to = shell_quote_remote_path(to_path);

    let mut from_channel = open_exec_channel(from_handle, format!("cat {quoted_from}")).await?;
    let mut to_channel = open_exec_channel(to_handle, format!("cat > {quoted_to}")).await?;

    let (chunk_tx, mut chunk_rx) = mpsc::channel::<Vec<u8>>(STREAM_PIPELINE_DEPTH);
    let read_cancel = cancel.clone();

    let read_task = tokio::spawn(async move {
        let mut reader = from_channel.make_reader();
        let mut read_result = Ok(());

        loop {
            let chunk = match async {
                check_cancel(read_cancel.as_deref())?;
                let mut buf = vec![0u8; STREAM_CHUNK_SIZE];
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

        drop(reader);
        read_result.and(wait_channel_success(&mut from_channel).await)
    });

    let mut writer = to_channel.make_writer();
    let mut transferred = 0u64;
    let mut progress = ThrottledProgress::new(on_progress, PROGRESS_EMIT_INTERVAL);

    while let Some(chunk) = chunk_rx.recv().await {
        check_cancel(cancel.as_deref())?;
        writer
            .write_all(&chunk)
            .await
            .map_err(|err| AppError::msg(err.to_string()))?;
        transferred += chunk.len() as u64;
        progress.report(transferred, total, false);
    }

    progress.report(transferred, total, true);
    writer.shutdown().await.ok();
    to_channel.eof().await.map_err(AppError::from)?;
    wait_channel_success(&mut to_channel).await?;

    match read_task.await {
        Ok(Ok(())) => Ok(()),
        Ok(Err(err)) => Err(err),
        Err(err) => Err(AppError::msg(err.to_string())),
    }
}

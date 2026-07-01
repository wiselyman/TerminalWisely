use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use russh::client;
use russh::ChannelMsg;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Mutex;
use tokio::time::{interval_at, Instant, MissedTickBehavior};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::shell::shell_quote_remote_path;
use crate::ssh::client::ClientHandler;
use crate::ssh::sftp;
use crate::transfer::{check_cancel, ThrottledProgressBytes};
use crate::types::{AuthMethod, SshConnectRequest};

const STREAM_CHUNK_SIZE: usize = 2 * 1024 * 1024;
const CANCEL_POLL_MS: u64 = 200;
const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(120);

pub const TRANSFER_METHOD_SCP: &str = "scp";

fn shell_quote_single(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn scp_path_token(path: &str) -> String {
    if path.is_empty() {
        return shell_quote_single(path);
    }
    if path.chars().all(|c| !c.is_whitespace() && c != '\'') {
        path.to_string()
    } else {
        shell_quote_single(path)
    }
}

fn scp_destination(user: &str, host: &str, remote_path: &str) -> String {
    format!("{user}@{host}:{}", scp_path_token(remote_path))
}

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

async fn remote_exec_exit_code(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    command: String,
) -> AppResult<u32> {
    let (code, _) = remote_exec_capture(handle, command).await?;
    Ok(code)
}

async fn remote_exec_capture(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    command: String,
) -> AppResult<(u32, Vec<u8>)> {
    let mut channel = open_exec_channel(handle, command).await?;
    let mut output = Vec::new();
    let mut exit_status: Option<u32> = None;
    while let Some(msg) = channel.wait().await {
        match msg {
            ChannelMsg::Data { data } => output.extend_from_slice(&data),
            ChannelMsg::ExitStatus { exit_status: code } => exit_status = Some(code),
            ChannelMsg::Close | ChannelMsg::Eof => break,
            _ => {}
        }
    }
    Ok((exit_status.unwrap_or(1), output))
}

async fn remote_file_size(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    remote_path: &str,
) -> Option<u64> {
    let quoted = shell_quote_remote_path(remote_path);
    let (code, output) = remote_exec_capture(
        handle,
        format!("stat -c %s {quoted} 2>/dev/null || echo 0"),
    )
    .await
    .ok()?;
    if code != 0 {
        return None;
    }
    String::from_utf8_lossy(&output)
        .split_whitespace()
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|size| *size > 0)
}

async fn deploy_remote_file(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    remote_path: &str,
    content: &[u8],
    chmod_mode: &str,
) -> AppResult<()> {
    let quoted_path = shell_quote_single(remote_path);

    if sftp::write_remote_bytes(handle, remote_path, content).await.is_ok() {
        let _ = remote_exec_exit_code(
            handle,
            format!("chmod {chmod_mode} {quoted_path} 2>/dev/null || true"),
        )
        .await;
        return Ok(());
    }

    let delimiter = format!("TW_EOF_{}", Uuid::new_v4().simple());
    let body = String::from_utf8_lossy(content);
    if body.contains(&delimiter) {
        return Err(AppError::msg("无法在源服务器准备临时认证文件"));
    }
    let cmd = format!(
        "cat > {quoted_path} << '{delimiter}'\n{body}{delimiter}\nchmod {chmod_mode} {quoted_path}"
    );
    if remote_exec_exit_code(handle, cmd).await? == 0 {
        return Ok(());
    }

    let encoded = B64.encode(content);
    let quoted_b64 = shell_quote_single(&encoded);
    if remote_exec_exit_code(
        handle,
        format!(
            "printf %s {quoted_b64} | (base64 -d 2>/dev/null || base64 -D 2>/dev/null || openssl base64 -d) > {quoted_path} \
             && chmod {chmod_mode} {quoted_path}"
        ),
    )
    .await?
        == 0
    {
        return Ok(());
    }

    let _ = remote_exec_exit_code(handle, format!("rm -f {quoted_path}")).await;
    Err(AppError::msg("无法在源服务器准备临时认证文件"))
}

async fn source_has_sshpass(handle: &Arc<Mutex<client::Handle<ClientHandler>>>) -> bool {
    remote_exec_exit_code(
        handle,
        "command -v sshpass >/dev/null 2>&1".to_string(),
    )
    .await
    .ok()
    .is_some_and(|code| code == 0)
}

struct ScpDestAuth {
    prefix: String,
    scp_args: String,
    cleanup: String,
}

async fn prepare_scp_dest_auth(
    from_handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    to_request: &SshConnectRequest,
) -> AppResult<ScpDestAuth> {
    let port = to_request.port;
    let scp_common = format!(
        "-O -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o Compression=no -P {port}"
    );

    let use_password = to_request.auth_method == AuthMethod::Password
        || to_request
            .password
            .as_ref()
            .is_some_and(|value| !value.is_empty());

    if use_password {
        let password = to_request
            .password
            .as_ref()
            .filter(|value| !value.is_empty())
            .ok_or_else(|| AppError::msg("目标服务器需要密码，请在书签中保存密码后重试"))?;

        if source_has_sshpass(from_handle).await {
            let quoted_pass = shell_quote_single(password);
            return Ok(ScpDestAuth {
                prefix: format!("SSHPASS={quoted_pass} sshpass -e "),
                scp_args: format!(
                    "{scp_common} -o PreferredAuthentications=password,keyboard-interactive \
                     -o PubkeyAuthentication=no"
                ),
                cleanup: ":".to_string(),
            });
        }

        let askpass_path = format!("/tmp/.tw-askpass-{}", Uuid::new_v4());
        let script = format!("#!/bin/sh\necho {}\n", shell_quote_single(password));
        deploy_remote_file(from_handle, &askpass_path, script.as_bytes(), "700").await?;
        let quoted_askpass = shell_quote_single(&askpass_path);

        return Ok(ScpDestAuth {
            prefix: format!(
                "DISPLAY=:0 SSH_ASKPASS={quoted_askpass} SSH_ASKPASS_REQUIRE=force setsid ",
            ),
            scp_args: format!(
                "{scp_common} -o PreferredAuthentications=password,keyboard-interactive \
                 -o PubkeyAuthentication=no"
            ),
            cleanup: format!("rm -f {quoted_askpass}"),
        });
    }

    let key_path = to_request
        .private_key_path
        .as_ref()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::msg("目标服务器需要私钥，请在书签中配置私钥"))?;
    let key_bytes = tokio::fs::read(key_path).await?;
    let remote_key = format!("/tmp/.tw-scp-{}", Uuid::new_v4());
    deploy_remote_file(from_handle, &remote_key, &key_bytes, "600").await?;
    let quoted_key = shell_quote_single(&remote_key);

    Ok(ScpDestAuth {
        prefix: String::new(),
        scp_args: format!("{scp_common} -o BatchMode=yes -i {quoted_key}"),
        cleanup: format!("rm -f {quoted_key}"),
    })
}

async fn read_chunk<R: tokio::io::AsyncRead + Unpin>(
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
                        return Err(AppError::msg(crate::transfer::CANCELLED_MSG));
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

/// Run `scp` on the source host so data goes source → destination directly.
pub async fn transfer_remote_via_server_scp<F>(
    from_handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    progress_handle: Option<&Arc<Mutex<client::Handle<ClientHandler>>>>,
    from_path: &str,
    to_request: &SshConnectRequest,
    to_path: &str,
    file_size: u64,
    cancel: Option<Arc<AtomicBool>>,
    mut on_progress: F,
) -> AppResult<()>
where
    F: FnMut(u64, u64, &str),
{
    let quoted_from = shell_quote_remote_path(from_path);
    let dest_target = scp_destination(&to_request.username, &to_request.host, to_path);

    let auth = prepare_scp_dest_auth(from_handle, to_request).await?;
    let cleanup = if auth.cleanup.is_empty() {
        ":".to_string()
    } else {
        auth.cleanup.clone()
    };
    let scp_cmd = format!(
        "{}scp {} {} {}; ec=$?; {}; exit $ec",
        auth.prefix, auth.scp_args, quoted_from, dest_target, cleanup,
    );

    let total = file_size.max(1);
    on_progress(0, total, TRANSFER_METHOD_SCP);

    let mut channel = open_exec_channel(from_handle, scp_cmd).await?;
    let mut detail = Vec::new();
    let mut exit_status: Option<u32> = None;
    let mut last_reported = 0u64;
    let mut at_full_since: Option<Instant> = None;
    let mut progress_tick = interval_at(Instant::now(), PROGRESS_EMIT_INTERVAL);
    progress_tick.set_missed_tick_behavior(MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            biased;
            _ = async {
                if let Some(cancel) = cancel.as_ref() {
                    loop {
                        if cancel.load(Ordering::SeqCst) {
                            break;
                        }
                        tokio::time::sleep(Duration::from_millis(CANCEL_POLL_MS)).await;
                    }
                } else {
                    std::future::pending::<()>().await;
                }
            }, if cancel.is_some() => {
                return Err(AppError::msg(crate::transfer::CANCELLED_MSG));
            }
            msg = channel.wait() => {
                match msg {
                    None => break,
                    Some(ChannelMsg::Data { data }) => detail.extend_from_slice(&data),
                    Some(ChannelMsg::ExitStatus { exit_status: code }) => {
                        exit_status = Some(code);
                        break;
                    }
                    Some(ChannelMsg::Close) | Some(ChannelMsg::Eof) => {}
                    Some(_) => {}
                }
            }
            _ = progress_tick.tick(), if progress_handle.is_some() => {
                check_cancel(cancel.as_deref())?;
                if let Some(handle) = progress_handle {
                    if let Some(size) = remote_file_size(handle, to_path).await {
                        let transferred = size.min(total);
                        if transferred > last_reported {
                            on_progress(transferred, total, TRANSFER_METHOD_SCP);
                            last_reported = transferred;
                        }
                        if transferred >= total {
                            at_full_since.get_or_insert_with(Instant::now);
                        } else {
                            at_full_since = None;
                        }
                    }
                }
            }
        }

        if exit_status.is_some() {
            break;
        }
        if at_full_since.is_some_and(|since| since.elapsed() >= Duration::from_secs(2))
            && last_reported >= total
        {
            break;
        }
    }

    if exit_status.is_none() {
        while let Some(msg) = channel.wait().await {
            if let ChannelMsg::ExitStatus { exit_status: code } = msg {
                exit_status = Some(code);
                break;
            }
        }
    }

    check_cancel(cancel.as_deref())?;

    let dest_complete = async {
        if let Some(handle) = progress_handle {
            if let Some(size) = remote_file_size(handle, to_path).await {
                return size >= total;
            }
        }
        last_reported >= total
    }
    .await;

    match exit_status {
        Some(0) => {
            on_progress(total, total, TRANSFER_METHOD_SCP);
            Ok(())
        }
        Some(_code) if dest_complete => {
            on_progress(total, total, TRANSFER_METHOD_SCP);
            Ok(())
        }
        Some(code) => {
            let text = String::from_utf8_lossy(&detail).trim().to_string();
            let message = if text.is_empty() {
                format!(
                    "SCP 失败（退出码 {code}）。请确认目标书签密码/私钥正确，且源机可访问目标 {host}:{port}",
                    host = to_request.host,
                    port = to_request.port,
                )
            } else {
                format!("SCP 失败（退出码 {code}）: {text}")
            };
            Err(AppError::msg(message))
        }
        None if dest_complete => {
            on_progress(total, total, TRANSFER_METHOD_SCP);
            Ok(())
        }
        None => Err(AppError::msg("SCP 未返回退出状态")),
    }
}

/// Pack a remote directory with `tar czf -` and stream to a local `.tar.gz` file.
pub async fn download_remote_directory_archive<F>(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    remote_dir: &str,
    local_archive: &Path,
    cancel: Option<Arc<AtomicBool>>,
    mut on_progress: F,
) -> AppResult<()>
where
    F: FnMut(u64, u64),
{
    let remote_path = Path::new(remote_dir);
    let dir_name = remote_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| AppError::msg("无效的目录路径"))?;
    let parent = remote_path
        .parent()
        .and_then(|p| p.to_str())
        .filter(|p| !p.is_empty())
        .unwrap_or(".");

    let cmd = format!(
        "tar czf - -C {} {}",
        shell_quote_remote_path(parent),
        shell_quote_remote_path(dir_name),
    );

    let mut channel = open_exec_channel(handle, cmd).await?;
    let mut reader = channel.make_reader();
    let mut file = tokio::fs::File::create(local_archive).await?;
    let mut transferred = 0u64;
    let mut progress = ThrottledProgressBytes::new(
        move |transferred| on_progress(transferred, transferred.max(1)),
        PROGRESS_EMIT_INTERVAL,
    );
    let mut buf = vec![0u8; STREAM_CHUNK_SIZE];

    loop {
        check_cancel(cancel.as_deref())?;
        let n = read_chunk(&mut reader, &mut buf, cancel.as_deref()).await?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).await?;
        transferred += n as u64;
        progress.report(transferred, false);
    }

    file.flush().await?;
    progress.report(transferred, true);
    drop(reader);
    wait_channel_success(&mut channel).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scp_destination_keeps_user_host_outside_quotes() {
        assert_eq!(
            scp_destination("root", "192.168.1.10", "/home/root/file.bin"),
            "root@192.168.1.10:/home/root/file.bin"
        );
    }

    #[test]
    fn scp_destination_quotes_path_with_spaces() {
        assert_eq!(
            scp_destination("root", "spark", "/home/a/my file"),
            "root@spark:'/home/a/my file'"
        );
    }
}

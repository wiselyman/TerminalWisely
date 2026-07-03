use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use russh::client;
use russh::ChannelMsg;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::shell::shell_quote_remote_path;
use crate::ssh::client::{exec_command, exec_command_with_stdin, ClientHandler};
use crate::ssh::sftp;
use crate::transfer::{check_cancel, ThrottledProgressBytes, CANCEL_POLL_MS};

pub const PREVIEW_SUDO_REQUIRED: &str = "PREVIEW_SUDO_REQUIRED";

const STREAM_CHUNK_SIZE: usize = 2 * 1024 * 1024;
const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(120);

pub fn is_permission_denied(err: &AppError) -> bool {
    let msg = err.to_string().to_lowercase();
    msg.contains("permission denied")
        || msg.contains("access denied")
        || msg.contains("eacces")
}

pub fn sudo_required(action: &str, path: &str) -> AppError {
    AppError::msg(format!(
        "{PREVIEW_SUDO_REQUIRED}: {action} `{path}` 需要 sudo 权限，请输入当前 SSH 用户的 sudo 密码"
    ))
}

fn is_sudo_auth_failure(err: &AppError) -> bool {
    let msg = err.to_string().to_lowercase();
    msg.contains("sorry, try again")
        || msg.contains("incorrect password")
        || msg.contains("a password is required")
        || msg.contains("no tty present")
}

pub async fn read_remote_bytes_sudo(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    remote_path: &str,
    sudo_password: Option<&str>,
    max_bytes: usize,
) -> AppResult<Vec<u8>> {
    let quoted = shell_quote_remote_path(remote_path);
    let cmd = format!("sudo -S cat {quoted}");

    if sudo_password.is_none() {
        let no_pass_cmd = format!("sudo -n cat {quoted}");
        if let Ok(stdout) = exec_command(handle, &no_pass_cmd).await {
            let mut bytes = stdout.into_bytes();
            if bytes.len() > max_bytes {
                bytes.truncate(max_bytes);
            }
            return Ok(bytes);
        }
    }

    let password = sudo_password.ok_or_else(|| sudo_required("读取", remote_path))?;
    let mut stdin = password.as_bytes().to_vec();
    stdin.push(b'\n');

    match exec_command_with_stdin(handle, &cmd, &stdin, max_bytes).await {
        Ok(bytes) => Ok(bytes),
        Err(err) if is_sudo_auth_failure(&err) => Err(sudo_required("读取", remote_path)),
        Err(err) => Err(err),
    }
}

pub async fn write_remote_bytes_sudo(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    remote_path: &str,
    sudo_password: Option<&str>,
    data: &[u8],
) -> AppResult<()> {
    let quoted = shell_quote_remote_path(remote_path);
    let cmd = format!("sudo -S tee {quoted} > /dev/null");

    if sudo_password.is_none() {
        let no_pass_cmd = format!("sudo -n tee {quoted} > /dev/null");
        if exec_command_with_stdin(handle, &no_pass_cmd, data, 0)
            .await
            .is_ok()
        {
            return Ok(());
        }
        return Err(sudo_required("保存", remote_path));
    }

    let mut stdin = sudo_password.unwrap().as_bytes().to_vec();
    stdin.push(b'\n');
    stdin.extend_from_slice(data);

    match exec_command_with_stdin(handle, &cmd, &stdin, 0).await {
        Ok(_) => Ok(()),
        Err(err) if is_sudo_auth_failure(&err) => Err(sudo_required("保存", remote_path)),
        Err(err) => Err(err),
    }
}

pub async fn exec_remote_sudo(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    shell_command: &str,
    sudo_password: Option<&str>,
    action: &str,
    path_hint: &str,
) -> AppResult<()> {
    if sudo_password.is_none() {
        let no_pass = format!("sudo -n {shell_command}");
        if exec_command(handle, &no_pass).await.is_ok() {
            return Ok(());
        }
        return Err(sudo_required(action, path_hint));
    }

    let cmd = format!("sudo -S {shell_command}");
    let mut stdin = sudo_password.unwrap().as_bytes().to_vec();
    stdin.push(b'\n');

    match exec_command_with_stdin(handle, &cmd, &stdin, 0).await {
        Ok(_) => Ok(()),
        Err(err) if is_sudo_auth_failure(&err) => Err(sudo_required(action, path_hint)),
        Err(err) => Err(err),
    }
}

pub async fn exec_remote_sudo_capture(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    shell_command: &str,
    sudo_password: Option<&str>,
    action: &str,
    path_hint: &str,
) -> AppResult<String> {
    if sudo_password.is_none() {
        let no_pass = format!("sudo -n {shell_command}");
        if let Ok(stdout) = exec_command(handle, &no_pass).await {
            if !stdout.trim().is_empty() {
                return Ok(stdout);
            }
        }
        return Err(sudo_required(action, path_hint));
    }

    let cmd = format!("sudo -S {shell_command}");
    let mut stdin = sudo_password.unwrap().as_bytes().to_vec();
    stdin.push(b'\n');

    match exec_command_with_stdin(handle, &cmd, &stdin, 4096).await {
        Ok(bytes) => Ok(String::from_utf8_lossy(&bytes).to_string()),
        Err(err) if is_sudo_auth_failure(&err) => Err(sudo_required(action, path_hint)),
        Err(err) => Err(err),
    }
}

async fn read_stream_chunk<R: AsyncRead + Unpin>(
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

async fn wait_stream_channel(
    channel: &mut russh::Channel<client::Msg>,
    action: &str,
    path_hint: &str,
) -> AppResult<()> {
    let mut stderr = String::new();
    let mut exit_status: Option<u32> = None;
    while let Some(msg) = channel.wait().await {
        match msg {
            ChannelMsg::ExtendedData { data, .. } => {
                stderr.push_str(&String::from_utf8_lossy(data.as_ref()));
            }
            ChannelMsg::ExitStatus { exit_status: code } => exit_status = Some(code),
            ChannelMsg::Close | ChannelMsg::Eof => break,
            _ => {}
        }
    }

    match exit_status {
        Some(0) | None => Ok(()),
        Some(_) if is_sudo_auth_failure(&AppError::msg(stderr.trim())) => {
            Err(sudo_required(action, path_hint))
        }
        Some(code) => {
            let detail = stderr.trim();
            if detail.is_empty() {
                Err(AppError::msg(format!("远程命令失败，退出码 {code}")))
            } else {
                Err(AppError::msg(format!(
                    "远程命令失败，退出码 {code}: {detail}"
                )))
            }
        }
    }
}

async fn open_sudo_stream_channel(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    shell_command: &str,
    sudo_password: Option<&str>,
    action: &str,
    path_hint: &str,
) -> AppResult<russh::Channel<client::Msg>> {
    use std::io::Cursor;

    if sudo_password.is_none() {
        return Err(sudo_required(action, path_hint));
    }

    let cmd = format!("sudo -S {shell_command}");
    let mut channel = {
        let handle_guard = handle.lock().await;
        handle_guard
            .channel_open_session()
            .await
            .map_err(AppError::from)?
    };
    channel.exec(true, cmd).await.map_err(AppError::from)?;

    let mut stdin = sudo_password.unwrap().as_bytes().to_vec();
    stdin.push(b'\n');
    channel
        .data(Cursor::new(stdin))
        .await
        .map_err(AppError::from)?;
    channel.eof().await.map_err(AppError::from)?;
    Ok(channel)
}

pub async fn stream_sudo_command_to_file<F>(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    shell_command: &str,
    sudo_password: Option<&str>,
    action: &str,
    path_hint: &str,
    local_path: &Path,
    cancel: Option<Arc<AtomicBool>>,
    mut on_progress: F,
) -> AppResult<()>
where
    F: FnMut(u64),
{
    let mut channel =
        open_sudo_stream_channel(handle, shell_command, sudo_password, action, path_hint).await?;
    let mut reader = channel.make_reader();
    let mut file = tokio::fs::File::create(local_path).await?;
    let mut transferred = 0u64;
    let mut progress = ThrottledProgressBytes::new(on_progress, PROGRESS_EMIT_INTERVAL);
    let mut buf = vec![0u8; STREAM_CHUNK_SIZE];

    loop {
        check_cancel(cancel.as_deref())?;
        let n = read_stream_chunk(&mut reader, &mut buf, cancel.as_deref()).await?;
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
    wait_stream_channel(&mut channel, action, path_hint).await
}

pub async fn install_remote_file_via_sudo<F>(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    local_path: &Path,
    remote_path: &str,
    sudo_password: Option<&str>,
    cancel: Option<Arc<AtomicBool>>,
    on_progress: F,
) -> AppResult<()>
where
    F: FnMut(u64),
{
    if sudo_password.is_none() {
        return Err(sudo_required("上传", remote_path));
    }

    let file_name = local_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::msg("无效的文件名"))?;
    let tmp_file = format!("/tmp/.tw-{}-{}", Uuid::new_v4().simple(), file_name);

    sftp::upload_file(handle, local_path, &tmp_file, cancel, on_progress).await?;

    let quoted_tmp = shell_quote_remote_path(&tmp_file);
    let quoted_dest = shell_quote_remote_path(remote_path);
    exec_remote_sudo(
        handle,
        &format!("mv -f {quoted_tmp} {quoted_dest}"),
        sudo_password,
        "上传",
        remote_path,
    )
    .await
}

pub async fn download_remote_file_with_sudo<F>(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    remote_path: &str,
    local_path: &Path,
    sudo_password: Option<&str>,
    cancel: Option<Arc<AtomicBool>>,
    mut on_progress: F,
) -> AppResult<()>
where
    F: FnMut(u64, u64),
{
    let download_result = {
        let progress_ref = &mut on_progress;
        sftp::download_file(
            handle,
            remote_path,
            local_path,
            cancel.clone(),
            |transferred, total| progress_ref(transferred, total),
        )
        .await
    };

    match download_result {
        Ok(()) => Ok(()),
        Err(err) if err.is_cancelled() => Err(err),
        Err(err) if is_permission_denied(&err) => {
            let quoted = shell_quote_remote_path(remote_path);
            stream_sudo_command_to_file(
                handle,
                &format!("cat {quoted}"),
                sudo_password,
                "下载",
                remote_path,
                local_path,
                cancel,
                |transferred| on_progress(transferred, transferred.max(1)),
            )
            .await
        }
        Err(err) => Err(err),
    }
}

pub async fn download_remote_directory_with_sudo<F>(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    remote_dir: &str,
    local_archive: &Path,
    sudo_password: Option<&str>,
    cancel: Option<Arc<AtomicBool>>,
    mut on_progress: F,
) -> AppResult<()>
where
    F: FnMut(u64, u64),
{
    let archive_result = {
        let progress_ref = &mut on_progress;
        crate::ssh::scp_transfer::download_remote_directory_archive(
            handle,
            remote_dir,
            local_archive,
            cancel.clone(),
            |transferred, total| progress_ref(transferred, total),
        )
        .await
    };

    match archive_result {
        Ok(()) => Ok(()),
        Err(err) if err.is_cancelled() => Err(err),
        Err(err) if is_permission_denied(&err) => {
            let remote_path = PathBuf::from(remote_dir);
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
            stream_sudo_command_to_file(
                handle,
                &cmd,
                sudo_password,
                "下载",
                remote_dir,
                local_archive,
                cancel,
                |transferred| on_progress(transferred, transferred.max(1)),
            )
            .await
        }
        Err(err) => Err(err),
    }
}

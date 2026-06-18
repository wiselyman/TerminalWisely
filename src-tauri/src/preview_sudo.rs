use std::sync::Arc;
use tokio::sync::Mutex;

use russh::client;

use crate::error::{AppError, AppResult};
use crate::shell::shell_quote_remote_path;
use crate::ssh::client::{exec_command, exec_command_with_stdin, ClientHandler};

pub const PREVIEW_SUDO_REQUIRED: &str = "PREVIEW_SUDO_REQUIRED";

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

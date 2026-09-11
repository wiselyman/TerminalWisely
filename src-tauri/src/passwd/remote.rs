use std::sync::Arc;

use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::passwd::{parse_passwd_accounts, LIST_PASSWD_ACCOUNTS_SCRIPT};
use crate::ssh::client::{exec_command, ClientHandler};
use russh::client;

pub async fn list_passwd_accounts(
    handle: Arc<Mutex<client::Handle<ClientHandler>>>,
) -> AppResult<crate::types::PasswdAccountsResult> {
    let stdout = exec_command(&handle, LIST_PASSWD_ACCOUNTS_SCRIPT)
        .await
        .map_err(|err| {
            let msg = err.to_string();
            if msg.contains("Channel send error")
                || msg.contains("connection reset")
                || msg.contains("broken pipe")
            {
                AppError::msg("SSH 连接已断开，无法获取用户列表")
            } else {
                err
            }
        })?;
    parse_passwd_accounts(&stdout)
}

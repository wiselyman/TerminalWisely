use std::sync::Arc;

use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::ssh::client::{exec_command, ClientHandler};
use crate::systemd::{parse_systemd_units, LIST_SYSTEMD_UNITS_SCRIPT};
use russh::client;

pub async fn list_systemd_units(
    handle: Arc<Mutex<client::Handle<ClientHandler>>>,
) -> AppResult<Vec<String>> {
    let stdout = exec_command(&handle, LIST_SYSTEMD_UNITS_SCRIPT)
        .await
        .map_err(|err| {
            let msg = err.to_string();
            if msg.contains("Channel send error")
                || msg.contains("connection reset")
                || msg.contains("broken pipe")
            {
                AppError::msg("SSH 连接已断开，无法获取服务列表")
            } else {
                err
            }
        })?;
    parse_systemd_units(&stdout)
}

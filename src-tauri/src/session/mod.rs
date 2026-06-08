use std::collections::HashMap;
use std::sync::Arc;

use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::pty::local::LocalSession;
use crate::ssh::client::{emit_transfer_complete, emit_transfer_progress, SshSession};
use crate::ssh::sftp;
use crate::transfer::TransferRegistry;
use crate::types::{
    DeviceRecord, DownloadFileRequest, ProbeRemotePathRequest, SavedConnection, SessionInfo,
    SessionKind, SshConnectRequest, TerminalOutputPayload, TransferProgressPayload,
    TransferRemoteRequest, UploadFileResult, UploadFilesRequest,
};

pub enum SessionHandle {
    Local(LocalSession),
    Ssh(SshSession),
}

impl SessionHandle {
    pub fn info(&self) -> SessionInfo {
        match self {
            Self::Local(s) => s.info(),
            Self::Ssh(s) => s.info(),
        }
    }

    pub fn write_input(&self, data: &str) -> AppResult<()> {
        match self {
            Self::Local(s) => s.write_input(data),
            Self::Ssh(s) => s.write_input(data),
        }
    }

    pub fn resize(&self, cols: u16, rows: u16) -> AppResult<()> {
        match self {
            Self::Local(s) => s.resize(cols, rows),
            Self::Ssh(s) => s.resize(cols, rows),
        }
    }

    pub fn close(&mut self) -> AppResult<()> {
        match self {
            Self::Local(s) => s.close(),
            Self::Ssh(s) => s.close(),
        }
    }
}

#[derive(Clone)]
pub struct SessionManager {
    sessions: Arc<Mutex<HashMap<String, SessionHandle>>>,
    transfers: TransferRegistry,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            transfers: TransferRegistry::new(),
        }
    }

    pub async fn cancel_transfer(&self, transfer_id: &str) -> bool {
        self.transfers.cancel(transfer_id).await
    }

    pub async fn create_local(&self, app: AppHandle, cols: u16, rows: u16) -> AppResult<SessionInfo> {
        let id = Uuid::new_v4().to_string();
        let session = LocalSession::spawn(app, id.clone(), cols, rows)?;
        let info = session.info();
        self.sessions
            .lock()
            .await
            .insert(id, SessionHandle::Local(session));
        Ok(info)
    }

    pub async fn create_ssh(
        &self,
        app: AppHandle,
        request: SshConnectRequest,
        cols: u16,
        rows: u16,
    ) -> AppResult<(SessionInfo, Option<crate::ssh::probe::ServerOsProfile>)> {
        let id = Uuid::new_v4().to_string();
        let (session, os_profile) =
            SshSession::connect(app, id.clone(), request, cols, rows).await?;
        let info = session.info();
        self.sessions
            .lock()
            .await
            .insert(id, SessionHandle::Ssh(session));
        Ok((info, os_profile))
    }

    pub async fn write_input(&self, session_id: &str, data: &str) -> AppResult<()> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| AppError::msg("Session not found"))?;
        session.write_input(data)
    }

    pub async fn resize(&self, session_id: &str, cols: u16, rows: u16) -> AppResult<()> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| AppError::msg("Session not found"))?;
        session.resize(cols, rows)
    }

    pub async fn close(&self, session_id: &str) -> AppResult<()> {
        let mut sessions = self.sessions.lock().await;
        if let Some(mut session) = sessions.remove(session_id) {
            session.close()?;
        }
        Ok(())
    }

    pub async fn list(&self) -> Vec<SessionInfo> {
        self.sessions
            .lock()
            .await
            .values()
            .map(|s| s.info())
            .collect()
    }

    pub async fn session_kind(&self, session_id: &str) -> AppResult<SessionKind> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| AppError::msg("Session not found"))?;
        Ok(match session {
            SessionHandle::Local(_) => SessionKind::Local,
            SessionHandle::Ssh(_) => SessionKind::Ssh,
        })
    }

    pub async fn ssh_snapshot(&self, session_id: &str) -> AppResult<crate::ssh::client::SshSessionSnapshot> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| AppError::msg("Session not found"))?;
        match session {
            SessionHandle::Ssh(s) => Ok(s.snapshot()),
            _ => Err(AppError::msg("Not an SSH session")),
        }
    }

    pub async fn upload_files(
        &self,
        app: AppHandle,
        request: UploadFilesRequest,
    ) -> AppResult<Vec<UploadFileResult>> {
        let session_id = request.session_id.clone();
        let transfer_id = TransferRegistry::resolve_transfer_id(request.transfer_id.clone());
        let handle = self
            .transfers
            .begin(transfer_id.clone(), session_id.clone(), "upload")
            .await;

        if let Some(first) = request.local_paths.first() {
            let filename = std::path::Path::new(first)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("upload");
            emit_transfer_progress(
                &app,
                &transfer_id,
                &session_id,
                filename,
                0,
                0,
                "upload",
            );
        }

        let ssh = {
            let sessions = self.sessions.lock().await;
            let session = sessions
                .get(&session_id)
                .ok_or_else(|| AppError::msg("Session not found"))?;
            match session {
                SessionHandle::Ssh(s) => s.snapshot(),
                _ => return Err(AppError::msg("Not an SSH session")),
            }
        };

        let result = ssh
            .upload_files(app, request, &transfer_id, Some(handle.cancel))
            .await;
        self.transfers.clear(&transfer_id).await;
        result
    }

    pub async fn download_file(
        &self,
        app: AppHandle,
        request: DownloadFileRequest,
    ) -> AppResult<String> {
        let session_id = request.session_id.clone();
        let transfer_id = TransferRegistry::resolve_transfer_id(request.transfer_id.clone());
        let handle = self
            .transfers
            .begin(transfer_id.clone(), session_id.clone(), "download")
            .await;

        let filename = std::path::Path::new(&request.remote_path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("download");
        emit_transfer_progress(
            &app,
            &transfer_id,
            &session_id,
            filename,
            0,
            0,
            "download",
        );

        let ssh = {
            let sessions = self.sessions.lock().await;
            let session = sessions
                .get(&session_id)
                .ok_or_else(|| AppError::msg("Session not found"))?;
            match session {
                SessionHandle::Ssh(s) => s.snapshot(),
                _ => return Err(AppError::msg("Not an SSH session")),
            }
        };

        let result = ssh
            .download_file(app, request, &transfer_id, Some(handle.cancel))
            .await;
        self.transfers.clear(&transfer_id).await;
        result
    }

    pub async fn enter_directory(&self, session_id: &str, path: &str) -> AppResult<()> {
        let mut sessions = self.sessions.lock().await;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| AppError::msg("Session not found"))?;
        match session {
            SessionHandle::Local(s) => s.enter_directory(path),
            SessionHandle::Ssh(s) => s.enter_remote_directory(path).await,
        }
    }

    pub async fn probe_remote_path(&self, request: ProbeRemotePathRequest) -> AppResult<String> {
        let ssh = {
            let sessions = self.sessions.lock().await;
            let session = sessions
                .get(&request.session_id)
                .ok_or_else(|| AppError::msg("Session not found"))?;
            match session {
                SessionHandle::Ssh(s) => s.snapshot(),
                _ => return Err(AppError::msg("Not an SSH session")),
            }
        };
        let resolved = ssh.resolve_remote_path(&request.path).await?;
        if sftp::is_remote_directory(&ssh.handle(), &resolved).await? {
            Ok("directory".to_string())
        } else {
            Ok("file".to_string())
        }
    }

    pub async fn transfer_remote_file(
        &self,
        app: AppHandle,
        request: TransferRemoteRequest,
    ) -> AppResult<()> {
        if request.from_session_id == request.to_session_id {
            return Err(AppError::msg("源和目标不能是同一个会话"));
        }

        let from_snap = {
            let sessions = self.sessions.lock().await;
            let from = sessions
                .get(&request.from_session_id)
                .ok_or_else(|| AppError::msg("源会话不存在"))?;
            match from {
                SessionHandle::Ssh(s) => s.snapshot(),
                _ => return Err(AppError::msg("跨服务器传输仅支持 SSH 会话")),
            }
        };

        let from_path = from_snap.resolve_remote_path(&request.remote_path).await?;
        let filename = std::path::Path::new(&from_path)
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| AppError::msg("无效的文件名"))?
            .to_string();
        let from_request = from_snap.connect_request().clone();

        let to_snap = {
            let sessions = self.sessions.lock().await;
            let to = sessions
                .get(&request.to_session_id)
                .ok_or_else(|| AppError::msg("目标会话不存在"))?;
            match to {
                SessionHandle::Ssh(s) => s.snapshot(),
                _ => return Err(AppError::msg("跨服务器传输仅支持 SSH 会话")),
            }
        };

        let to_dir = match request.remote_dir.filter(|d| !d.is_empty()) {
            Some(dir) => to_snap.resolve_remote_path(&dir).await?,
            None => to_snap.current_remote_cwd().await,
        };
        let to_path = format!("{}/{}", to_dir.trim_end_matches('/'), filename);
        let to_request = to_snap.connect_request().clone();
        let to_session_id = to_snap.session_id();

        let file_size = crate::ssh::sftp::remote_file_size(&from_snap.handle(), &from_path)
            .await
            .unwrap_or(0);

        let transfer_id =
            TransferRegistry::resolve_transfer_id(request.transfer_id.clone());
        let handle = self
            .transfers
            .begin(transfer_id.clone(), to_session_id.clone(), "send")
            .await;
        emit_transfer_progress(
            &app,
            &transfer_id,
            &to_session_id,
            &filename,
            0,
            file_size,
            "send",
        );
        let manager = self.clone();
        let app_bg = app.clone();
        let app_progress = app.clone();
        let progress_session_id = to_session_id.clone();
        let progress_transfer_id = transfer_id.clone();
        let registry_transfer_id = transfer_id.clone();
        let fname = filename.clone();
        let cancel = handle.cancel;

        tokio::spawn(async move {
            let transfer_result = async {
                let from_conn = crate::ssh::client::open_transfer_connection(
                    &from_request,
                    Some(cancel.as_ref()),
                )
                .await?;
                let to_conn = crate::ssh::client::open_transfer_connection(
                    &to_request,
                    Some(cancel.as_ref()),
                )
                .await?;

                crate::ssh::stream_transfer::transfer_remote_file(
                    &from_conn.handle(),
                    &to_conn.handle(),
                    &from_path,
                    &to_path,
                    file_size,
                    Some(cancel),
                    move |transferred, total| {
                        let _ = app_progress.emit(
                            "transfer-progress",
                            TransferProgressPayload {
                                transfer_id: progress_transfer_id.clone(),
                                session_id: progress_session_id.clone(),
                                filename: fname.clone(),
                                transferred,
                                total,
                                direction: "send".to_string(),
                            },
                        );
                    },
                )
                .await
            }
            .await;

            manager.transfers.clear(&registry_transfer_id).await;

            if let Err(err) = transfer_result {
                if err.is_cancelled() {
                    if let Ok(to_conn) =
                        crate::ssh::client::open_transfer_connection(&to_request, None).await
                    {
                        let _ = crate::ssh::sftp::remove_remote_file(
                            &to_conn.handle(),
                            &to_path,
                        )
                        .await;
                    }
                    emit_transfer_complete(
                        &app_bg,
                        &registry_transfer_id,
                        &to_session_id,
                        "send",
                        crate::transfer::CANCELLED_MSG,
                        false,
                        vec![filename.clone()],
                        None,
                    );
                    return;
                }

                emit_transfer_complete(
                    &app_bg,
                    &registry_transfer_id,
                    &to_session_id,
                    "send",
                    &err.to_string(),
                    false,
                    vec![filename.clone()],
                    None,
                );
                return;
            }

            let success_message = format!("已发送到目标服务器: {filename}");

            if manager.write_input(&to_session_id, "ls\r").await.is_err() {
                emit_transfer_complete(
                    &app_bg,
                    &registry_transfer_id,
                    &to_session_id,
                    "send",
                    &format!("{success_message}（刷新目录失败）"),
                    true,
                    vec![filename.clone()],
                    None,
                );
                return;
            }

            emit_transfer_complete(
                &app_bg,
                &registry_transfer_id,
                &to_session_id,
                "send",
                &success_message,
                true,
                vec![filename],
                None,
            );
        });

        Ok(())
    }

    pub fn emit_terminal_message(app: &AppHandle, session_id: &str, message: &str) {
        let _ = app.emit(
            "terminal-output",
            TerminalOutputPayload {
                session_id: session_id.to_string(),
                data: format!("\r\n\x1b[36m{message}\x1b[0m\r\n"),
            },
        );
    }
}

pub fn expand_path(path: &str) -> AppResult<String> {
    if path.starts_with("~/") {
        let home = dirs::home_dir().ok_or_else(|| AppError::msg("Home directory not found"))?;
        Ok(home.join(&path[2..]).to_string_lossy().to_string())
    } else if path == "~" {
        Ok(dirs::home_dir()
            .ok_or_else(|| AppError::msg("Home directory not found"))?
            .to_string_lossy()
            .to_string())
    } else {
        Ok(path.to_string())
    }
}

pub fn default_download_dir() -> AppResult<String> {
    dirs::download_dir()
        .or_else(dirs::home_dir)
        .map(|p| p.join("TerminalWisely").to_string_lossy().to_string())
        .ok_or_else(|| AppError::msg("Download directory not found"))
}

pub fn saved_connection_from_request(
    name: &str,
    request: &SshConnectRequest,
) -> SavedConnection {
    SavedConnection {
        id: Uuid::new_v4().to_string(),
        name: name.to_string(),
        host: request.host.clone(),
        port: request.port,
        username: request.username.clone(),
        auth_method: request.auth_method.clone(),
        private_key_path: request.private_key_path.clone(),
        password: None,
        os_id: None,
        os_name: None,
    }
}

pub fn update_matching_saved_connections_os(
    app: &AppHandle,
    request: &SshConnectRequest,
    os: &crate::ssh::probe::ServerOsProfile,
) -> AppResult<()> {
    let mut connections = load_connections(app)?;
    let mut changed = false;
    for conn in connections.iter_mut() {
        if conn.host == request.host
            && conn.port == request.port
            && conn.username == request.username
        {
            conn.os_id = Some(os.os_id.clone());
            conn.os_name = os.os_name.clone();
            changed = true;
        }
    }
    if changed {
        store_connections(app, &connections)?;
    }
    Ok(())
}

pub fn request_from_saved(saved: &SavedConnection, password: Option<String>) -> SshConnectRequest {
    SshConnectRequest {
        host: saved.host.clone(),
        port: saved.port,
        username: saved.username.clone(),
        auth_method: saved.auth_method.clone(),
        password: password.or_else(|| saved.password.clone()),
        private_key_path: saved.private_key_path.clone(),
        passphrase: None,
        session_title: Some(saved.name.clone()),
    }
}

pub fn store_connections(app: &AppHandle, connections: &[SavedConnection]) -> AppResult<()> {
    let store = app.store("connections.json")?;
    store.set("connections", serde_json::to_value(connections)?);
    store.save()?;
    Ok(())
}

pub fn load_connections(app: &AppHandle) -> AppResult<Vec<SavedConnection>> {
    let store = app.store("connections.json")?;
    match store.get("connections") {
        Some(value) => Ok(serde_json::from_value(value.clone())?),
        None => Ok(Vec::new()),
    }
}

fn device_key(host: &str, port: u16, username: &str) -> String {
    format!("{username}@{host}:{port}")
}

pub fn device_record_from_request(request: &SshConnectRequest) -> DeviceRecord {
    let now = chrono::Local::now().to_rfc3339();
    DeviceRecord {
        id: device_key(&request.host, request.port, &request.username),
        host: request.host.clone(),
        port: request.port,
        username: request.username.clone(),
        auth_method: request.auth_method.clone(),
        private_key_path: request.private_key_path.clone(),
        last_connected_at: now,
        connect_count: 1,
    }
}

pub fn request_from_device(device: &DeviceRecord, password: Option<String>) -> SshConnectRequest {
    SshConnectRequest {
        host: device.host.clone(),
        port: device.port,
        username: device.username.clone(),
        auth_method: device.auth_method.clone(),
        password,
        private_key_path: device.private_key_path.clone(),
        passphrase: None,
        session_title: None,
    }
}

pub fn record_device_history(app: &AppHandle, request: &SshConnectRequest) -> AppResult<DeviceRecord> {
    let mut devices = load_device_history(app)?;
    let key = device_key(&request.host, request.port, &request.username);
    let now = chrono::Local::now().to_rfc3339();

    if let Some(existing) = devices
        .iter_mut()
        .find(|device| device.id == key)
    {
        existing.last_connected_at = now.clone();
        existing.connect_count = existing.connect_count.saturating_add(1);
        existing.auth_method = request.auth_method.clone();
        existing.private_key_path = request.private_key_path.clone();
        let updated = existing.clone();
        devices.sort_by(|a, b| b.last_connected_at.cmp(&a.last_connected_at));
        store_device_history(app, &devices)?;
        return Ok(updated);
    }

    let record = device_record_from_request(request);
    devices.insert(0, record.clone());
    store_device_history(app, &devices)?;
    Ok(record)
}

pub fn store_device_history(app: &AppHandle, devices: &[DeviceRecord]) -> AppResult<()> {
    let store = app.store("device-history.json")?;
    store.set("devices", serde_json::to_value(devices)?);
    store.save()?;
    Ok(())
}

pub fn load_device_history(app: &AppHandle) -> AppResult<Vec<DeviceRecord>> {
    let store = app.store("device-history.json")?;
    match store.get("devices") {
        Some(value) => Ok(serde_json::from_value(value.clone())?),
        None => Ok(Vec::new()),
    }
}

use std::collections::HashMap;

use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::pty::local::LocalSession;
use crate::ssh::client::SshSession;
use crate::types::{
    DeviceRecord, DownloadFileRequest, SavedConnection, SessionInfo, SshConnectRequest,
    TerminalOutputPayload, UploadFileResult, UploadFilesRequest,
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

    pub fn write_input(&mut self, data: &str) -> AppResult<()> {
        match self {
            Self::Local(s) => s.write_input(data),
            Self::Ssh(s) => s.write_input(data),
        }
    }

    pub fn resize(&mut self, cols: u16, rows: u16) -> AppResult<()> {
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

pub struct SessionManager {
    sessions: Mutex<HashMap<String, SessionHandle>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
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
    ) -> AppResult<SessionInfo> {
        let id = Uuid::new_v4().to_string();
        let session = SshSession::connect(app, id.clone(), request, cols, rows).await?;
        let info = session.info();
        self.sessions
            .lock()
            .await
            .insert(id, SessionHandle::Ssh(session));
        Ok(info)
    }

    pub async fn write_input(&self, session_id: &str, data: &str) -> AppResult<()> {
        let mut sessions = self.sessions.lock().await;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| AppError::msg("Session not found"))?;
        session.write_input(data)
    }

    pub async fn resize(&self, session_id: &str, cols: u16, rows: u16) -> AppResult<()> {
        let mut sessions = self.sessions.lock().await;
        let session = sessions
            .get_mut(session_id)
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

    pub async fn upload_files(
        &self,
        app: AppHandle,
        request: UploadFilesRequest,
    ) -> AppResult<Vec<UploadFileResult>> {
        let mut sessions = self.sessions.lock().await;
        let session = sessions
            .get_mut(&request.session_id)
            .ok_or_else(|| AppError::msg("Session not found"))?;
        match session {
            SessionHandle::Ssh(s) => s.upload_files(app, request).await,
            _ => Err(AppError::msg("Not an SSH session")),
        }
    }

    pub async fn download_file(
        &self,
        app: AppHandle,
        request: DownloadFileRequest,
    ) -> AppResult<String> {
        let mut sessions = self.sessions.lock().await;
        let session = sessions
            .get_mut(&request.session_id)
            .ok_or_else(|| AppError::msg("Session not found"))?;
        match session {
            SessionHandle::Ssh(s) => s.download_file(app, request).await,
            _ => Err(AppError::msg("Not an SSH session")),
        }
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
    }
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

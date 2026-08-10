use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::fs_archive;
use crate::preview_sudo;
use crate::pty::local::LocalSession;
use crate::shell::shell_quote_remote_path;
use crate::ssh::client::{emit_transfer_complete, emit_transfer_progress, SshSession};
use crate::ssh::{probe, sftp};
use crate::transfer::TransferRegistry;
use crate::types::{
    DeviceRecord, DownloadFileRequest, ProbeRemotePathRequest, SavedConnection, SessionInfo,
    SessionKind, SshConnectRequest, TerminalOutputPayload, TransferProgressPayload,
    TransferRemoteRequest, UploadFileResult, UploadFilesRequest, AuthMethod,
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

    pub async fn create_local(
        &self,
        app: AppHandle,
        cols: u16,
        rows: u16,
    ) -> AppResult<SessionInfo> {
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

    pub async fn probe_ssh_metadata(
        &self,
        session_id: &str,
    ) -> AppResult<Option<probe::ServerOsProfile>> {
        let handle = {
            let sessions = self.sessions.lock().await;
            let session = sessions
                .get(session_id)
                .ok_or_else(|| AppError::msg("Session not found"))?;
            match session {
                SessionHandle::Ssh(s) => s.handle(),
                SessionHandle::Local(_) => return Ok(None),
            }
        };

        let (remote_home, os_profile) = {
            let guard = handle.lock().await;
            let home = sftp::resolve_remote_home(&guard).await?;
            let os = probe::probe_remote_os(&guard).await.ok();
            (home, os)
        };

        let mut sessions = self.sessions.lock().await;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| AppError::msg("Session not found"))?;
        match session {
            SessionHandle::Ssh(s) => {
                s.update_metadata(remote_home, os_profile.clone()).await;
            }
            SessionHandle::Local(_) => {}
        }

        Ok(os_profile)
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

    pub async fn reconnect_ssh(
        &self,
        app: AppHandle,
        session_id: &str,
        cols: u16,
        rows: u16,
    ) -> AppResult<()> {
        let mut sessions = self.sessions.lock().await;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| AppError::msg("Session not found"))?;
        match session {
            SessionHandle::Ssh(s) => s.reconnect(app, cols, rows).await,
            SessionHandle::Local(_) => Err(AppError::msg("本地终端不支持重新连接")),
        }
    }

    pub async fn list(&self) -> Vec<SessionInfo> {
        self.sessions
            .lock()
            .await
            .values()
            .map(|s| s.info())
            .collect()
    }

    pub async fn session_info(&self, session_id: &str) -> AppResult<SessionInfo> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| AppError::msg("Session not found"))?;
        Ok(session.info())
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

    pub async fn local_path_context(&self, session_id: &str) -> AppResult<(String, String)> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| AppError::msg("Session not found"))?;
        match session {
            SessionHandle::Local(s) => Ok((s.home_dir_path(), s.current_cwd_path())),
            SessionHandle::Ssh(_) => Err(AppError::msg("Not a local session")),
        }
    }

    pub async fn local_resolve_host_path(
        &self,
        session_id: &str,
        path: &str,
    ) -> AppResult<std::path::PathBuf> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| AppError::msg("Session not found"))?;
        match session {
            SessionHandle::Local(s) => s.resolve_host_path(path),
            SessionHandle::Ssh(_) => Err(AppError::msg("Not a local session")),
        }
    }

    pub async fn local_unix_runner(
        &self,
        session_id: &str,
    ) -> Option<crate::local_shell::LocalUnixRunner> {
        let sessions = self.sessions.lock().await;
        let session = sessions.get(session_id)?;
        match session {
            SessionHandle::Local(s) => s.unix_runner().cloned(),
            SessionHandle::Ssh(_) => None,
        }
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
                None,
                None,
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
            None,
            None,
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

    pub async fn download_directory(
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

        let dir_name = std::path::Path::new(&request.remote_path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("folder");

        emit_transfer_progress(
            &app,
            &transfer_id,
            &session_id,
            &format!("{dir_name}.tar.gz"),
            0,
            0,
            "download",
            None,
            None,
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
            .download_directory(app, request, &transfer_id, Some(handle.cancel))
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
        match sftp::remote_path_kind(&ssh.handle(), &resolved).await? {
            Some(true) => Ok("directory".to_string()),
            Some(false) => Ok("file".to_string()),
            None => Ok("file".to_string()),
        }
    }

    pub async fn get_path_size(
        &self,
        request: crate::types::PathSizeRequest,
    ) -> AppResult<crate::types::PathSizeResult> {
        let kind = self.session_kind(&request.session_id).await?;
        let sudo_password = request.sudo_password.as_deref();

        match kind {
            SessionKind::Local => {
                let resolved = self
                    .local_resolve_host_path(&request.session_id, &request.path)
                    .await?;
                let (is_dir, size_bytes) = crate::path_size::local_path_size(&resolved).await?;
                Ok(crate::types::PathSizeResult {
                    path: request.path,
                    kind: if is_dir {
                        "directory".to_string()
                    } else {
                        "file".to_string()
                    },
                    size_bytes,
                })
            }
            SessionKind::Ssh => {
                let ssh = self.ssh_snapshot(&request.session_id).await?;
                let resolved = ssh.resolve_remote_path(&request.path).await?;
                let is_dir = sftp::is_remote_directory(&ssh.handle(), &resolved).await?;
                let size_bytes = crate::path_size::remote_path_size(
                    &ssh.handle(),
                    &resolved,
                    is_dir,
                    sudo_password,
                )
                .await?;
                Ok(crate::types::PathSizeResult {
                    path: request.path,
                    kind: if is_dir {
                        "directory".to_string()
                    } else {
                        "file".to_string()
                    },
                    size_bytes,
                })
            }
        }
    }

    pub async fn list_processes(
        &self,
        session_id: &str,
        mode: crate::types::ProcessListMode,
    ) -> AppResult<crate::types::ProcessListResult> {
        let ssh_handle = {
            let sessions = self.sessions.lock().await;
            let session = sessions
                .get(session_id)
                .ok_or_else(|| AppError::msg("Session not found"))?;
            match session {
                SessionHandle::Local(_) => None,
                SessionHandle::Ssh(s) => Some(s.handle()),
            }
        };

        if let Some(handle) = ssh_handle {
            crate::process::list_remote_processes(handle, mode).await
        } else {
            tokio::task::spawn_blocking(move || crate::process::list_local_processes(mode))
                .await
                .map_err(|e| AppError::msg(e.to_string()))?
        }
    }

    pub async fn list_systemd_units(&self, session_id: &str) -> AppResult<Vec<String>> {
        let ssh_handle = {
            let sessions = self.sessions.lock().await;
            let session = sessions
                .get(session_id)
                .ok_or_else(|| AppError::msg("Session not found"))?;
            match session {
                SessionHandle::Local(_) => None,
                SessionHandle::Ssh(s) => Some(s.handle()),
            }
        };

        if let Some(handle) = ssh_handle {
            crate::systemd::list_remote_systemd_units(handle).await
        } else {
            tokio::task::spawn_blocking(crate::systemd::list_local_systemd_units)
                .await
                .map_err(|e| AppError::msg(e.to_string()))?
        }
    }

    pub async fn list_passwd_accounts(
        &self,
        session_id: &str,
    ) -> AppResult<crate::types::PasswdAccountsResult> {
        let ssh_handle = {
            let sessions = self.sessions.lock().await;
            let session = sessions
                .get(session_id)
                .ok_or_else(|| AppError::msg("Session not found"))?;
            match session {
                SessionHandle::Local(_) => None,
                SessionHandle::Ssh(s) => Some(s.handle()),
            }
        };

        if let Some(handle) = ssh_handle {
            crate::passwd::list_remote_passwd_accounts(handle).await
        } else {
            tokio::task::spawn_blocking(crate::passwd::list_local_passwd_accounts)
                .await
                .map_err(|e| AppError::msg(e.to_string()))?
        }
    }

    pub async fn complete_path(&self, session_id: &str, partial: &str) -> AppResult<Vec<String>> {
        let (kind, cwd, home, ssh_snap) = {
            let sessions = self.sessions.lock().await;
            let session = sessions
                .get(session_id)
                .ok_or_else(|| AppError::msg("Session not found"))?;
            match session {
                SessionHandle::Local(s) => (
                    SessionKind::Local,
                    s.current_cwd_path(),
                    s.home_dir_path(),
                    None,
                ),
                SessionHandle::Ssh(s) => (
                    SessionKind::Ssh,
                    String::new(),
                    String::new(),
                    Some(s.snapshot()),
                ),
            }
        };

        match kind {
            SessionKind::Local => {
                let partial = partial.to_string();
                tokio::task::spawn_blocking(move || {
                    crate::path_complete::complete_local_path_from_partial(
                        &partial, &cwd, &home,
                    )
                })
                .await
                .map_err(|e| AppError::msg(e.to_string()))?
            }
            SessionKind::Ssh => {
                let ssh = ssh_snap.ok_or_else(|| AppError::msg("Not an SSH session"))?;
                crate::path_complete::complete_remote_path_from_partial(ssh, partial).await
            }
        }
    }

    pub async fn kill_process(
        &self,
        session_id: &str,
        pid: u32,
        force: bool,
    ) -> AppResult<()> {
        let ssh_handle = {
            let sessions = self.sessions.lock().await;
            let session = sessions
                .get(session_id)
                .ok_or_else(|| AppError::msg("Session not found"))?;
            match session {
                SessionHandle::Local(_) => None,
                SessionHandle::Ssh(s) => Some(s.handle()),
            }
        };

        if let Some(handle) = ssh_handle {
            crate::process::kill_remote_process(handle, pid, force).await
        } else {
            tokio::task::spawn_blocking(move || {
                crate::process::kill_local_process(pid, force)
            })
            .await
            .map_err(|e| AppError::msg(e.to_string()))?
        }
    }

    pub async fn get_session_cwd(&self, session_id: &str) -> AppResult<String> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| AppError::msg("Session not found"))?;
        match session {
            SessionHandle::Local(s) => Ok(s.current_cwd_display()),
            SessionHandle::Ssh(s) => Ok(s.current_remote_cwd().await),
        }
    }

    pub async fn find_files(
        &self,
        request: crate::types::FindFilesRequest,
    ) -> AppResult<crate::types::FindFilesResult> {
        let normalized = crate::find::normalize_request(&request)?;

        let ssh_snap = {
            let sessions = self.sessions.lock().await;
            let session = sessions
                .get(&normalized.session_id)
                .ok_or_else(|| AppError::msg("Session not found"))?;
            match session {
                SessionHandle::Local(_) => None,
                SessionHandle::Ssh(s) => Some(s.snapshot()),
            }
        };

        if let Some(ssh) = ssh_snap {
            let start_path = if normalized.path == "." {
                ssh.current_remote_cwd().await
            } else {
                ssh.resolve_remote_path(&normalized.path).await?
            };
            return crate::find::find_remote_files(ssh.handle(), &start_path, normalized).await;
        }

        let local_cwd = {
            let sessions = self.sessions.lock().await;
            let session = sessions
                .get(&normalized.session_id)
                .ok_or_else(|| AppError::msg("Session not found"))?;
            match session {
                SessionHandle::Local(s) => (
                    s.current_cwd_path(),
                    s.unix_runner().cloned(),
                ),
                SessionHandle::Ssh(_) => {
                    return Err(AppError::msg("Not a local session"));
                }
            }
        };

        let (cwd, unix_runner) = local_cwd;

        let start_path = if normalized.path.trim().is_empty() || normalized.path == "." {
            cwd
        } else {
            resolve_local_find_start(&normalized.path)?
        };

        let normalized_for_blocking = normalized.clone();
        let runner_for_blocking = unix_runner.clone();
        tokio::task::spawn_blocking(move || {
            crate::find::find_local_files(
                &start_path,
                normalized_for_blocking,
                runner_for_blocking.as_ref(),
            )
        })
        .await
        .map_err(|e| AppError::msg(e.to_string()))?
    }

    pub async fn get_host_stats(
        &self,
        session_id: &str,
    ) -> AppResult<crate::types::HostStatsSnapshot> {
        let ssh_handle = {
            let sessions = self.sessions.lock().await;
            let session = sessions
                .get(session_id)
                .ok_or_else(|| AppError::msg("Session not found"))?;
            match session {
                SessionHandle::Local(_) => None,
                SessionHandle::Ssh(s) => Some(s.handle()),
            }
        };

        if let Some(handle) = ssh_handle {
            crate::host_stats::collect_remote(handle).await
        } else {
            tokio::task::spawn_blocking(crate::host_stats::collect_local)
                .await
                .map_err(|e| AppError::msg(e.to_string()))?
        }
    }

    pub async fn transfer_remote_file(
        &self,
        app: AppHandle,
        request: TransferRemoteRequest,
    ) -> AppResult<()> {
        if request.from_session_id == request.to_session_id {
            return Err(AppError::code("ERR_SAME_SESSION"));
        }

        enum TransferSource {
            Local {
                path: PathBuf,
                size: u64,
            },
            Remote {
                from_request: SshConnectRequest,
                from_path: String,
                size: u64,
                recursive: bool,
            },
        }

        let source = {
            let is_local = {
                let sessions = self.sessions.lock().await;
                let from = sessions
                    .get(&request.from_session_id)
                    .ok_or_else(|| AppError::msg("源会话不存在"))?;
                matches!(from, SessionHandle::Local(_))
            };

            if is_local {
                let resolved = self
                    .local_resolve_host_path(&request.from_session_id, &request.remote_path)
                    .await?;
                let metadata = tokio::fs::metadata(&resolved).await?;
                if metadata.is_dir() {
                    return Err(AppError::code("ERR_CANNOT_SEND_DIRECTORY"));
                }
                TransferSource::Local {
                    path: resolved,
                    size: metadata.len(),
                }
            } else {
                let from_snap = self.ssh_snapshot(&request.from_session_id).await?;
                let from_path = from_snap.resolve_remote_path(&request.remote_path).await?;
                let recursive = sftp::is_remote_directory(&from_snap.handle(), &from_path)
                    .await
                    .unwrap_or(false);
                let size = if recursive {
                    crate::path_size::remote_path_size(
                        &from_snap.handle(),
                        &from_path,
                        true,
                        None,
                    )
                    .await
                    .unwrap_or(0)
                } else {
                    crate::ssh::sftp::remote_file_size(&from_snap.handle(), &from_path)
                        .await
                        .unwrap_or(0)
                };
                TransferSource::Remote {
                    from_request: from_snap.connect_request().clone(),
                    from_path,
                    size,
                    recursive,
                }
            }
        };

        let filename = match &source {
            TransferSource::Local { path, .. } => path
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| AppError::msg("无效的文件名"))?
                .to_string(),
            TransferSource::Remote { from_path, .. } => std::path::Path::new(from_path)
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| AppError::msg("无效的文件名"))?
                .to_string(),
        };

        let to_snap = {
            let sessions = self.sessions.lock().await;
            let to = sessions
                .get(&request.to_session_id)
                .ok_or_else(|| AppError::msg("目标会话不存在"))?;
            match to {
                SessionHandle::Ssh(s) => s.snapshot(),
                _ => return Err(AppError::code("ERR_TARGET_MUST_BE_SSH")),
            }
        };

        let to_dir = match request.remote_dir.filter(|d| !d.is_empty()) {
            Some(dir) => to_snap.resolve_remote_path(&dir).await?,
            None => to_snap.current_remote_cwd().await,
        };
        let to_path = format!("{}/{}", to_dir.trim_end_matches('/'), filename);
        let to_request = enrich_connect_request_from_bookmarks(&app, &to_snap.connect_request());
        let to_session_id = to_snap.session_id();

        let file_size = match &source {
            TransferSource::Local { size, .. } | TransferSource::Remote { size, .. } => *size,
        };

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
            None,
            Some(&to_path),
        );
        let manager = self.clone();
        let app_bg = app.clone();
        let app_progress = app.clone();
        let progress_session_id = to_session_id.clone();
        let progress_transfer_id = transfer_id.clone();
        let registry_transfer_id = transfer_id.clone();
        let fname = filename.clone();
        let to_path_progress = to_path.clone();
        let cancel = handle.cancel;
        let sudo_password = request.sudo_password.clone();

        tokio::spawn(async move {
            let transfer_result = async {
                match source {
                    TransferSource::Local { path, size } => {
                        let to_conn = crate::ssh::client::open_transfer_connection(
                            &to_request,
                            Some(cancel.as_ref()),
                        )
                        .await?;
                        let app_sftp = app_progress.clone();
                        let tid_sftp = progress_transfer_id.clone();
                        let sid_sftp = progress_session_id.clone();
                        let fname_sftp = fname.clone();
                        let dest_sftp = to_path_progress.clone();
                        let app_sudo = app_progress.clone();
                        let tid_sudo = progress_transfer_id.clone();
                        let sid_sudo = progress_session_id.clone();
                        let fname_sudo = fname.clone();
                        let dest_sudo = to_path_progress.clone();
                        match sftp::upload_file(
                            &to_conn.handle(),
                            &path,
                            &to_path,
                            Some(cancel.clone()),
                            move |transferred| {
                                let _ = app_sftp.emit(
                                    "transfer-progress",
                                    TransferProgressPayload {
                                        transfer_id: tid_sftp.clone(),
                                        session_id: sid_sftp.clone(),
                                        filename: fname_sftp.clone(),
                                        transferred,
                                        total: size,
                                        direction: "send".to_string(),
                                        method: Some("sftp".to_string()),
                                        destination_path: Some(dest_sftp.clone()),
                                    },
                                );
                            },
                        )
                        .await
                        {
                            Ok(()) => Ok(()),
                            Err(err) if err.is_cancelled() => Err(err),
                            Err(err) if preview_sudo::is_permission_denied(&err) => {
                                preview_sudo::install_remote_file_via_sudo(
                                    &to_conn.handle(),
                                    &path,
                                    &to_path,
                                    sudo_password.as_deref(),
                                    Some(cancel),
                                    move |transferred| {
                                        let _ = app_sudo.emit(
                                            "transfer-progress",
                                            TransferProgressPayload {
                                                transfer_id: tid_sudo.clone(),
                                                session_id: sid_sudo.clone(),
                                                filename: fname_sudo.clone(),
                                                transferred,
                                                total: size,
                                                direction: "send".to_string(),
                                                method: Some("sudo".to_string()),
                                                destination_path: Some(dest_sudo.clone()),
                                            },
                                        );
                                    },
                                )
                                .await
                            }
                            Err(err) => Err(err),
                        }
                    }
                    TransferSource::Remote {
                        from_request,
                        from_path,
                        size,
                        recursive,
                    } => {
                        let from_request =
                            enrich_connect_request_from_bookmarks(&app_progress, &from_request);
                        let to_request =
                            enrich_connect_request_from_bookmarks(&app_progress, &to_request);
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

                        let app_for_scp = app_progress.clone();
                        let tid_for_scp = progress_transfer_id.clone();
                        let sid_for_scp = progress_session_id.clone();
                        let fname_for_scp = fname.clone();

                        let to_path_for_progress = to_path_progress.clone();
                        let sudo_password_scp = sudo_password.clone();

                        match crate::ssh::scp_transfer::transfer_remote_via_server_scp(
                            &from_conn.handle(),
                            Some(&to_conn.handle()),
                            &from_path,
                            &to_request,
                            &to_path,
                            size,
                            recursive,
                            Some(cancel.clone()),
                            move |transferred, total, method| {
                                let _ = app_for_scp.emit(
                                    "transfer-progress",
                                    TransferProgressPayload {
                                        transfer_id: tid_for_scp.clone(),
                                        session_id: sid_for_scp.clone(),
                                        filename: fname_for_scp.clone(),
                                        transferred,
                                        total,
                                        direction: "send".to_string(),
                                        method: Some(method.to_string()),
                                        destination_path: Some(to_path_for_progress.clone()),
                                    },
                                );
                            },
                        )
                        .await
                        {
                            Ok(()) => Ok(()),
                            Err(err) if err.is_cancelled() => Err(err),
                            Err(err)
                                if preview_sudo::is_permission_denied(&err)
                                    || err.to_string().to_lowercase().contains("permission denied") =>
                            {
                                let tmp_dest = format!("/tmp/.tw-{}", Uuid::new_v4());
                                crate::ssh::scp_transfer::transfer_remote_via_server_scp(
                                    &from_conn.handle(),
                                    Some(&to_conn.handle()),
                                    &from_path,
                                    &to_request,
                                    &tmp_dest,
                                    size,
                                    recursive,
                                    Some(cancel),
                                    |_, _, _| {},
                                )
                                .await?;
                                let quoted_tmp = shell_quote_remote_path(&tmp_dest);
                                let quoted_dest = shell_quote_remote_path(&to_path);
                                preview_sudo::exec_remote_sudo(
                                    &to_conn.handle(),
                                    &format!("mv -f {quoted_tmp} {quoted_dest}"),
                                    sudo_password_scp.as_deref(),
                                    "发送",
                                    &to_path,
                                )
                                .await
                            }
                            Err(err) => Err(err),
                        }
                    }
                }
            }
            .await;

            manager.transfers.clear(&registry_transfer_id).await;

            if let Err(err) = transfer_result {
                if err.is_cancelled() {
                    if let Ok(to_conn) =
                        crate::ssh::client::open_transfer_connection(&to_request, None).await
                    {
                        let _ = crate::ssh::sftp::remove_remote_path(
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

            let success_message = format!("已发送到 {to_path}");

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

            let manager_refresh = manager.clone();
            let refresh_session_id = to_session_id.clone();
            tokio::spawn(async move {
                let _ = manager_refresh
                    .write_input(&refresh_session_id, "ls\r")
                    .await;
            });
        });

        Ok(())
    }

    pub async fn refresh_listing(&self, session_id: &str) -> AppResult<()> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| AppError::msg("Session not found"))?;
        match session {
            SessionHandle::Local(s) => {
                let cmd = if s.uses_unix_shell() {
                    "ls --color=auto -F\r"
                } else {
                    "dir\r"
                };
                s.write_input(cmd)
            }
            SessionHandle::Ssh(s) => s.write_input("ls -F\r"),
        }
    }

    pub async fn rename_path(
        &self,
        session_id: &str,
        path: &str,
        new_name: &str,
        sudo_password: Option<&str>,
    ) -> AppResult<()> {
        validate_fs_name(new_name)?;

        let kind = self.session_kind(session_id).await?;
        match kind {
            SessionKind::Local => {
                let old_path = self.local_resolve_host_path(session_id, path).await?;
                let parent = old_path
                    .parent()
                    .ok_or_else(|| AppError::msg("无效路径"))?;
                let new_path = parent.join(new_name.trim());
                tokio::fs::rename(&old_path, &new_path).await?;
            }
            SessionKind::Ssh => {
                let ssh = self.ssh_snapshot(session_id).await?;
                let resolved = ssh.resolve_remote_path(path).await?;
                let parent = remote_parent_path(&resolved)?;
                let new_path = remote_join_path(&parent, new_name.trim());
                if let Err(err) =
                    sftp::rename_remote_path(&ssh.handle(), &resolved, &new_path).await
                {
                    if preview_sudo::is_permission_denied(&err) {
                        let quoted_src = shell_quote_remote_path(&resolved);
                        let quoted_dest = shell_quote_remote_path(&new_path);
                        preview_sudo::exec_remote_sudo(
                            &ssh.handle(),
                            &format!("mv {quoted_src} {quoted_dest}"),
                            sudo_password,
                            "重命名",
                            &resolved,
                        )
                        .await?;
                    } else {
                        return Err(err);
                    }
                }
            }
        }

        self.refresh_listing(session_id).await
    }

    pub async fn delete_path(
        &self,
        session_id: &str,
        path: &str,
        sudo_password: Option<&str>,
    ) -> AppResult<()> {
        let kind = self.session_kind(session_id).await?;
        match kind {
            SessionKind::Local => {
                let resolved = self.local_resolve_host_path(session_id, path).await?;
                let metadata = tokio::fs::metadata(&resolved).await?;
                if metadata.is_dir() {
                    tokio::fs::remove_dir_all(&resolved).await?;
                } else {
                    tokio::fs::remove_file(&resolved).await?;
                }
            }
            SessionKind::Ssh => {
                let ssh = self.ssh_snapshot(session_id).await?;
                let resolved = ssh.resolve_remote_path(path).await?;
                if let Err(err) = sftp::remove_remote_path(&ssh.handle(), &resolved).await {
                    if preview_sudo::is_permission_denied(&err) {
                        let quoted = shell_quote_remote_path(&resolved);
                        preview_sudo::exec_remote_sudo(
                            &ssh.handle(),
                            &format!("rm -rf {quoted}"),
                            sudo_password,
                            "删除",
                            &resolved,
                        )
                        .await?;
                    } else {
                        return Err(err);
                    }
                }
            }
        }

        self.refresh_listing(session_id).await
    }

    pub async fn move_path(
        &self,
        session_id: &str,
        path: &str,
        dest_dir: &str,
        sudo_password: Option<&str>,
    ) -> AppResult<()> {
        let kind = self.session_kind(session_id).await?;
        match kind {
            SessionKind::Local => {
                let resolved = self.local_resolve_host_path(session_id, path).await?;
                let dest = self.local_resolve_host_path(session_id, dest_dir).await?;
                let metadata = tokio::fs::metadata(&dest).await?;
                if !metadata.is_dir() {
                    return Err(AppError::msg("目标必须是目录"));
                }
                let file_name = resolved
                    .file_name()
                    .and_then(|n| n.to_str())
                    .ok_or_else(|| AppError::msg("无效的文件名"))?;
                let new_path = dest.join(file_name);
                tokio::fs::rename(&resolved, &new_path).await?;
            }
            SessionKind::Ssh => {
                let ssh = self.ssh_snapshot(session_id).await?;
                let resolved = ssh.resolve_remote_path(path).await?;
                let dest = ssh.resolve_remote_path(dest_dir).await?;
                if !sftp::is_remote_directory(&ssh.handle(), &dest).await? {
                    return Err(AppError::msg("目标必须是目录"));
                }
                let file_name = std::path::Path::new(&resolved)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .ok_or_else(|| AppError::msg("无效的文件名"))?;
                let new_path = remote_join_path(&dest, file_name);
                if let Err(err) =
                    sftp::rename_remote_path(&ssh.handle(), &resolved, &new_path).await
                {
                    if preview_sudo::is_permission_denied(&err) {
                        let quoted_src = shell_quote_remote_path(&resolved);
                        let quoted_dest = shell_quote_remote_path(&new_path);
                        preview_sudo::exec_remote_sudo(
                            &ssh.handle(),
                            &format!("mv {quoted_src} {quoted_dest}"),
                            sudo_password,
                            "移动",
                            &resolved,
                        )
                        .await?;
                    } else {
                        return Err(err);
                    }
                }
            }
        }

        self.refresh_listing(session_id).await
    }

    pub async fn compress_path(
        &self,
        session_id: &str,
        path: &str,
        sudo_password: Option<&str>,
    ) -> AppResult<()> {
        let kind = self.session_kind(session_id).await?;
        match kind {
            SessionKind::Local => {
                let resolved = self.local_resolve_host_path(session_id, path).await?;
                let parent = resolved
                    .parent()
                    .ok_or_else(|| AppError::msg("无效路径"))?;
                let basename = resolved
                    .file_name()
                    .and_then(|name| name.to_str())
                    .ok_or_else(|| AppError::msg("无效路径"))?;
                let archive = fs_archive::local_archive_output_path(parent, basename);
                fs_archive::local_compress(parent, basename, &archive).await?;
            }
            SessionKind::Ssh => {
                let ssh = self.ssh_snapshot(session_id).await?;
                let resolved = ssh.resolve_remote_path(path).await?;
                let parent = remote_parent_path(&resolved)?;
                let basename = resolved
                    .rsplit('/')
                    .next()
                    .filter(|name| !name.is_empty())
                    .ok_or_else(|| AppError::msg("无效路径"))?;
                let archive_path = fs_archive::archive_output_path(&parent, basename);
                let cmd =
                    fs_archive::remote_compress_command(&parent, basename, &archive_path);
                if let Err(err) = crate::ssh::client::exec_command(&ssh.handle(), &cmd).await {
                    if preview_sudo::is_permission_denied(&err) {
                        preview_sudo::exec_remote_sudo(
                            &ssh.handle(),
                            &cmd,
                            sudo_password,
                            "压缩",
                            &resolved,
                        )
                        .await?;
                    } else {
                        return Err(err);
                    }
                }
            }
        }

        self.refresh_listing(session_id).await
    }

    pub async fn extract_archive(
        &self,
        session_id: &str,
        path: &str,
        sudo_password: Option<&str>,
    ) -> AppResult<()> {
        let kind = self.session_kind(session_id).await?;
        match kind {
            SessionKind::Local => {
                let resolved = self.local_resolve_host_path(session_id, path).await?;
                let basename = resolved
                    .file_name()
                    .and_then(|name| name.to_str())
                    .ok_or_else(|| AppError::msg("无效路径"))?;
                let archive_kind = fs_archive::archive_kind_from_name(basename)
                    .ok_or_else(|| AppError::msg("不支持的压缩格式"))?;
                let parent = resolved
                    .parent()
                    .ok_or_else(|| AppError::msg("无效路径"))?;
                fs_archive::local_extract(archive_kind, &resolved, parent).await?;
            }
            SessionKind::Ssh => {
                let ssh = self.ssh_snapshot(session_id).await?;
                let resolved = ssh.resolve_remote_path(path).await?;
                let basename = resolved
                    .rsplit('/')
                    .next()
                    .filter(|name| !name.is_empty())
                    .ok_or_else(|| AppError::msg("无效路径"))?;
                let archive_kind = fs_archive::archive_kind_from_name(basename)
                    .ok_or_else(|| AppError::msg("不支持的压缩格式"))?;
                let parent = remote_parent_path(&resolved)?;
                let cmd =
                    fs_archive::remote_extract_command(archive_kind, &resolved, &parent)?;
                if let Err(err) = crate::ssh::client::exec_command(&ssh.handle(), &cmd).await {
                    if preview_sudo::is_permission_denied(&err) {
                        preview_sudo::exec_remote_sudo(
                            &ssh.handle(),
                            &cmd,
                            sudo_password,
                            "解压",
                            &resolved,
                        )
                        .await?;
                    } else {
                        return Err(err);
                    }
                }
            }
        }

        self.refresh_listing(session_id).await
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

pub fn enrich_connect_request_from_bookmarks(
    app: &AppHandle,
    request: &SshConnectRequest,
) -> SshConnectRequest {
    let mut req = request.clone();
    let Ok(connections) = load_connections(app) else {
        return req;
    };
    let Some(saved) = connections.iter().find(|saved| {
        saved.host == req.host && saved.port == req.port && saved.username == req.username
    }) else {
        return req;
    };
    if let Some(password) = saved.password.clone().filter(|value| !value.is_empty()) {
        req.auth_method = AuthMethod::Password;
        req.password = Some(password);
    }
    req
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

fn validate_fs_name(name: &str) -> AppResult<()> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::msg("名称不能为空"));
    }
    if trimmed == "." || trimmed == ".." {
        return Err(AppError::msg("无效的名称"));
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err(AppError::msg("名称不能包含路径分隔符"));
    }
    Ok(())
}

fn remote_parent_path(path: &str) -> AppResult<String> {
    let trimmed = path.trim_end_matches('/');
    if trimmed.is_empty() || trimmed == "/" {
        return Err(AppError::msg("无法操作根目录"));
    }
    if let Some((parent, _)) = trimmed.rsplit_once('/') {
        Ok(if parent.is_empty() {
            "/".to_string()
        } else {
            parent.to_string()
        })
    } else {
        Err(AppError::msg("无效的路径"))
    }
}

fn remote_join_path(base: &str, segment: &str) -> String {
    format!(
        "{}/{}",
        base.trim_end_matches('/'),
        segment.trim_matches('/')
    )
}

fn resolve_local_find_start(path: &str) -> AppResult<String> {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed == "." {
        return Ok(
            dirs::home_dir()
                .map(|home| home.to_string_lossy().to_string())
                .unwrap_or_else(|| ".".to_string()),
        );
    }
    if trimmed == "~" {
        return Ok(
            dirs::home_dir()
                .map(|home| home.to_string_lossy().to_string())
                .unwrap_or_else(|| ".".to_string()),
        );
    }
    Ok(trimmed.to_string())
}

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::preview_sudo;
use crate::session::SessionManager;
use crate::ssh::client;
use crate::ssh::client::ClientHandler;
use crate::ssh::sftp;
use crate::types::{PreviewOpenRequest, PreviewOpenResult, SessionKind};

pub const MAX_TEXT_PREVIEW_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Clone)]
struct PreviewEntry {
    session_id: String,
    source_path: String,
    local_path: PathBuf,
    #[allow(dead_code)]
    kind: String,
    uses_sudo: bool,
}

#[derive(Clone, Default)]
pub struct PreviewManager {
    entries: std::sync::Arc<Mutex<HashMap<String, PreviewEntry>>>,
}

impl PreviewManager {
    pub fn new() -> Self {
        Self {
            entries: std::sync::Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn close(&self, handle_id: &str) {
        self.entries.lock().await.remove(handle_id);
    }

    pub async fn close_session(&self, session_id: &str) {
        let mut entries = self.entries.lock().await;
        entries.retain(|_, entry| entry.session_id != session_id);
    }

    pub async fn save(
        &self,
        sessions: &SessionManager,
        handle_id: &str,
        content: String,
        sudo_password: Option<String>,
    ) -> AppResult<PreviewOpenResult> {
        let entry = self
            .entries
            .lock()
            .await
            .get(handle_id)
            .cloned()
            .ok_or_else(|| AppError::msg("预览已关闭"))?;

        if !is_editable_kind(&entry.kind) {
            return Err(AppError::msg("此文件类型不支持编辑"));
        }

        let session_kind = sessions.session_kind(&entry.session_id).await?;
        let bytes = content.as_bytes();

        match session_kind {
            SessionKind::Local => {
                let path = if tokio::fs::try_exists(&entry.local_path)
                    .await
                    .unwrap_or(false)
                {
                    entry.local_path
                } else {
                    sessions
                        .local_resolve_host_path(&entry.session_id, &entry.source_path)
                        .await?
                };
                tokio::fs::write(&path, bytes).await?;
            }
            SessionKind::Ssh => {
                let ssh = sessions.ssh_snapshot(&entry.session_id).await?;
                if entry.uses_sudo {
                    preview_sudo::write_remote_bytes_sudo(
                        &ssh.handle(),
                        &entry.source_path,
                        sudo_password.as_deref(),
                        bytes,
                    )
                    .await?;
                } else {
                    let conn =
                        client::open_transfer_connection(&ssh.connect_request(), None).await?;
                    sftp::write_remote_bytes(&conn.handle(), &entry.source_path, bytes).await?;
                }
            }
        }

        let path = PathBuf::from(&entry.source_path);
        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file")
            .to_string();
        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        let total_size = bytes.len() as u64;

        Ok(text_preview_result(
            handle_id.to_string(),
            entry.kind,
            entry.session_id,
            entry.source_path,
            filename,
            extension,
            total_size,
            false,
            content,
            entry.uses_sudo,
        ))
    }

    pub async fn open_in_system(
        &self,
        app: &AppHandle,
        sessions: &SessionManager,
        handle_id: &str,
    ) -> AppResult<()> {
        let entry = self
            .entries
            .lock()
            .await
            .get(handle_id)
            .cloned()
            .ok_or_else(|| AppError::msg("预览已关闭"))?;

        let open_path = if tokio::fs::try_exists(&entry.local_path)
            .await
            .unwrap_or(false)
        {
            entry.local_path
        } else {
            let session_kind = sessions.session_kind(&entry.session_id).await?;
            match session_kind {
                SessionKind::Local => {
                    return Err(AppError::msg(format!(
                        "本地文件不存在: {}",
                        entry.source_path
                    )));
                }
                SessionKind::Ssh => {
                    let cache_path = materialize_for_preview(
                        app,
                        sessions,
                        session_kind,
                        &entry.session_id,
                        &entry.local_path,
                        &entry.source_path,
                        0,
                    )
                    .await?;
                    if let Some(stored) = self.entries.lock().await.get_mut(handle_id) {
                        stored.local_path = cache_path.clone();
                    }
                    cache_path
                }
            }
        };

        let path = path_to_display(&open_path);
        app.opener()
            .open_path(&path, None::<&str>)
            .map_err(|e| AppError::msg(e.to_string()))
    }

    pub async fn open(
        &self,
        app: &AppHandle,
        sessions: &SessionManager,
        request: PreviewOpenRequest,
    ) -> AppResult<PreviewOpenResult> {
        let session_id = request.session_id.clone();
        let kind = sessions.session_kind(&session_id).await?;

        let (resolved, is_dir, total_size) = match kind {
            SessionKind::Local => {
                let path = sessions
                    .local_resolve_host_path(&session_id, &request.path)
                    .await?;
                let metadata = tokio::fs::metadata(&path).await?;
                (path, metadata.is_dir(), metadata.len())
            }
            SessionKind::Ssh => {
                let ssh = sessions.ssh_snapshot(&session_id).await?;
                let resolved = ssh.resolve_remote_path(&request.path).await?;
                let (is_dir, total_size) =
                    probe_ssh_file(&ssh.handle(), &resolved).await?;
                (PathBuf::from(resolved), is_dir, total_size)
            }
        };

        if is_dir {
            return Err(AppError::msg("这是目录，请单击进入目录"));
        }

        let resolved_str = path_to_display(&resolved);
        let filename = resolved
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file")
            .to_string();
        let extension = resolved
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        let preview_kind = resolve_preview_kind(&extension, total_size);

        let handle_id = Uuid::new_v4().to_string();

        match preview_kind.as_str() {
            "text" | "markdown" | "html" | "csv" => {
                let sudo_password = request.sudo_password.as_deref();
                let (text, truncated, uses_sudo) = match kind {
                    SessionKind::Local => {
                        let (text, truncated) = read_local_text(&resolved, total_size).await?;
                        (text, truncated, false)
                    }
                    SessionKind::Ssh => {
                        read_remote_text(
                            sessions,
                            &session_id,
                            &resolved_str,
                            total_size,
                            sudo_password,
                        )
                        .await?
                    }
                };

                self.entries.lock().await.insert(
                    handle_id.clone(),
                    PreviewEntry {
                        session_id: session_id.clone(),
                        source_path: resolved_str.clone(),
                        local_path: resolved.clone(),
                        kind: preview_kind.clone(),
                        uses_sudo,
                    },
                );

                Ok(text_preview_result(
                    handle_id,
                    preview_kind,
                    session_id,
                    resolved_str,
                    filename,
                    extension,
                    if total_size > 0 {
                        total_size
                    } else {
                        text.len() as u64
                    },
                    truncated,
                    text,
                    uses_sudo,
                ))
            }
            "image" | "pdf" => {
                let cache_path = materialize_for_preview(
                    app,
                    sessions,
                    kind,
                    &session_id,
                    &resolved,
                    &resolved_str,
                    total_size,
                )
                .await?;

                self.entries.lock().await.insert(
                    handle_id.clone(),
                    PreviewEntry {
                        session_id: session_id.clone(),
                        source_path: resolved_str.clone(),
                        local_path: cache_path.clone(),
                        kind: preview_kind.clone(),
                        uses_sudo: false,
                    },
                );

                Ok(PreviewOpenResult {
                    handle_id,
                    kind: preview_kind,
                    session_id,
                    resolved_path: resolved_str,
                    filename,
                    extension,
                    total_size,
                    truncated: false,
                    editable: false,
                    text_content: None,
                    local_cache_path: Some(path_to_display(&cache_path)),
                    uses_sudo: false,
                })
            }
            _ => {
                if total_size > 50 * 1024 * 1024 {
                    return Err(AppError::msg("文件过大，暂不支持预览"));
                }
                let cache_path = materialize_for_preview(
                    app,
                    sessions,
                    kind,
                    &session_id,
                    &resolved,
                    &resolved_str,
                    total_size,
                )
                .await?;

                self.entries.lock().await.insert(
                    handle_id.clone(),
                    PreviewEntry {
                        session_id,
                        source_path: resolved_str.clone(),
                        local_path: cache_path.clone(),
                        kind: "unsupported".to_string(),
                        uses_sudo: false,
                    },
                );

                Ok(PreviewOpenResult {
                    handle_id,
                    kind: "unsupported".to_string(),
                    session_id: request.session_id,
                    resolved_path: resolved_str,
                    filename,
                    extension,
                    total_size,
                    truncated: false,
                    editable: false,
                    text_content: None,
                    local_cache_path: Some(path_to_display(&cache_path)),
                    uses_sudo: false,
                })
            }
        }
    }
}

pub async fn probe_path(
    sessions: &SessionManager,
    session_id: &str,
    path: &str,
) -> AppResult<String> {
    let kind = sessions.session_kind(session_id).await?;
    match kind {
        SessionKind::Local => {
            let path = sessions.local_resolve_host_path(session_id, path).await?;
            let metadata = tokio::fs::metadata(&path).await?;
            if metadata.is_dir() {
                Ok("directory".to_string())
            } else {
                Ok("file".to_string())
            }
        }
        SessionKind::Ssh => {
            let ssh = sessions.ssh_snapshot(session_id).await?;
            let resolved = ssh.resolve_remote_path(path).await?;
            if sftp::is_remote_directory(&ssh.handle(), &resolved).await? {
                Ok("directory".to_string())
            } else {
                Ok("file".to_string())
            }
        }
    }
}

fn classify_preview_kind(extension: &str) -> String {
    match extension {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "ico" => "image".to_string(),
        "pdf" => "pdf".to_string(),
        "csv" | "tsv" => "csv".to_string(),
        "md" | "markdown" => "markdown".to_string(),
        "html" | "htm" => "html".to_string(),
        "txt" | "log" | "json" | "yaml" | "yml" | "toml" | "xml" | "css" | "js" | "ts" | "tsx"
        | "jsx" | "rs" | "py" | "go" | "java" | "c" | "cpp" | "h" | "hpp" | "sh" | "bash"
        | "zsh" | "fish" | "sql" | "ini" | "cfg" | "conf" | "env" | "mod" | "sum" => {
            "text".to_string()
        }
        _ => "unsupported".to_string(),
    }
}

fn resolve_preview_kind(extension: &str, total_size: u64) -> String {
    let kind = classify_preview_kind(extension);
    if kind == "unsupported" && total_size <= MAX_TEXT_PREVIEW_BYTES {
        return "text".to_string();
    }
    kind
}

fn is_editable_kind(kind: &str) -> bool {
    matches!(kind, "text" | "markdown" | "html" | "csv")
}

fn text_preview_result(
    handle_id: String,
    kind: String,
    session_id: String,
    resolved_path: String,
    filename: String,
    extension: String,
    total_size: u64,
    truncated: bool,
    text: String,
    uses_sudo: bool,
) -> PreviewOpenResult {
    PreviewOpenResult {
        handle_id,
        editable: !truncated && is_editable_kind(&kind),
        kind,
        session_id,
        resolved_path,
        filename,
        extension,
        total_size,
        truncated,
        text_content: Some(text),
        local_cache_path: None,
        uses_sudo,
    }
}

fn path_to_display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

async fn read_local_text(path: &Path, total_size: u64) -> AppResult<(String, bool)> {
    let truncated = total_size > MAX_TEXT_PREVIEW_BYTES;
    let limit = total_size.min(MAX_TEXT_PREVIEW_BYTES) as usize;
    let bytes = if truncated {
        let mut file = tokio::fs::File::open(path).await?;
        let mut buf = vec![0u8; limit];
        use tokio::io::AsyncReadExt;
        file.read_exact(&mut buf).await?;
        buf
    } else {
        tokio::fs::read(path).await?
    };
    Ok((decode_text_bytes(&bytes), truncated))
}

async fn probe_ssh_file(
    handle: &Arc<Mutex<russh::client::Handle<ClientHandler>>>,
    path: &str,
) -> AppResult<(bool, u64)> {
    match (
        sftp::is_remote_directory(handle, path).await,
        sftp::remote_file_size(handle, path).await,
    ) {
        (Ok(is_dir), Ok(size)) => Ok((is_dir, size)),
        (Err(err), _) | (_, Err(err)) if preview_sudo::is_permission_denied(&err) => {
            if path.ends_with('/') {
                return Err(AppError::msg("这是目录，请单击进入目录"));
            }
            Ok((false, 0))
        }
        (Err(err), _) => Err(err),
        (_, Err(err)) => Err(err),
    }
}

async fn read_remote_text(
    sessions: &SessionManager,
    session_id: &str,
    remote_path: &str,
    total_size: u64,
    sudo_password: Option<&str>,
) -> AppResult<(String, bool, bool)> {
    let truncated = total_size > MAX_TEXT_PREVIEW_BYTES;
    let limit = if total_size > 0 {
        total_size.min(MAX_TEXT_PREVIEW_BYTES) as usize
    } else {
        MAX_TEXT_PREVIEW_BYTES as usize
    };

    let ssh = sessions.ssh_snapshot(session_id).await?;
    let conn = client::open_transfer_connection(&ssh.connect_request(), None).await?;

    match sftp::read_remote_file_bytes(&conn.handle(), remote_path, limit).await {
        Ok((bytes, _)) => Ok((decode_text_bytes(&bytes), truncated, false)),
        Err(err) if preview_sudo::is_permission_denied(&err) => {
            let bytes =
                preview_sudo::read_remote_bytes_sudo(&ssh.handle(), remote_path, sudo_password, limit)
                    .await?;
            let actual_truncated = total_size > MAX_TEXT_PREVIEW_BYTES
                || (total_size == 0 && bytes.len() >= limit);
            Ok((decode_text_bytes(&bytes), actual_truncated, true))
        }
        Err(err) => Err(err),
    }
}

fn decode_text_bytes(bytes: &[u8]) -> String {
    if let Ok(text) = std::str::from_utf8(bytes) {
        return text.to_string();
    }
    String::from_utf8_lossy(bytes).into_owned()
}

async fn materialize_for_preview(
    app: &AppHandle,
    sessions: &SessionManager,
    kind: SessionKind,
    session_id: &str,
    local_path: &Path,
    remote_path: &str,
    _total_size: u64,
) -> AppResult<PathBuf> {
    let cache_dir = preview_cache_dir(app, session_id)?;
    tokio::fs::create_dir_all(&cache_dir).await?;

    let file_name = local_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("preview.bin");
    let cache_path = cache_dir.join(file_name);

    match kind {
        SessionKind::Local => Ok(local_path.to_path_buf()),
        SessionKind::Ssh => {
            let ssh = sessions.ssh_snapshot(session_id).await?;
            let conn = client::open_transfer_connection(&ssh.connect_request(), None).await?;
            sftp::download_file(
                &conn.handle(),
                remote_path,
                &cache_path,
                None,
                |_, _| {},
            )
            .await?;
            Ok(cache_path)
        }
    }
}

fn preview_cache_dir(app: &AppHandle, session_id: &str) -> AppResult<PathBuf> {
    let base = app
        .path()
        .cache_dir()
        .map_err(|e| AppError::msg(e.to_string()))?;
    Ok(base.join("preview").join(session_id))
}

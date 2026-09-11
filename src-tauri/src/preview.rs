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
use crate::shell::shell_quote_remote_path;
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
            .ok_or_else(|| AppError::code("ERR_PREVIEW_CLOSED"))?;

        if !is_editable_kind(&entry.kind) {
            return Err(AppError::code("ERR_PREVIEW_NOT_EDITABLE"));
        }

        let session_kind = sessions.session_kind(&entry.session_id).await?;
        let bytes = content.as_bytes();
        let mut used_sudo = entry.uses_sudo;

        let _ = session_kind;
        let ssh = sessions.ssh_snapshot(&entry.session_id).await?;
        if used_sudo {
            preview_sudo::write_remote_bytes_sudo(
                &ssh.handle(),
                &entry.source_path,
                sudo_password.as_deref(),
                bytes,
            )
            .await?;
        } else {
            match sftp::write_remote_bytes(&ssh.handle(), &entry.source_path, bytes).await {
                Ok(()) => {}
                // Readable but not writable (e.g. /etc/docker/daemon.json): escalate.
                Err(err) if preview_sudo::is_permission_denied(&err) => {
                    preview_sudo::write_remote_bytes_sudo(
                        &ssh.handle(),
                        &entry.source_path,
                        sudo_password.as_deref(),
                        bytes,
                    )
                    .await?;
                    used_sudo = true;
                }
                Err(err) => return Err(err),
            }
        }

        if used_sudo && !entry.uses_sudo {
            if let Some(stored) = self.entries.lock().await.get_mut(handle_id) {
                stored.uses_sudo = true;
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
            used_sudo,
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
            .ok_or_else(|| AppError::code("ERR_PREVIEW_CLOSED"))?;

        let open_path = if tokio::fs::try_exists(&entry.local_path)
            .await
            .unwrap_or(false)
        {
            entry.local_path
        } else {
            let session_kind = sessions.session_kind(&entry.session_id).await?;
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
        let ssh = sessions.ssh_snapshot(&session_id).await?;
        let resolved = ssh.resolve_remote_path(&request.path).await?;
        let path_buf = PathBuf::from(&resolved);
        let filename = path_buf
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file")
            .to_string();
        let extension = path_buf
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        let classified = classify_preview_kind(&extension);
        let handle_id = Uuid::new_v4().to_string();
        let sudo_password = request.sudo_password.as_deref();

        // Fast path for text: one exec on the existing SSH session.
        if is_text_preview_kind(&classified) {
            let fetch =
                fetch_remote_text_preview(&ssh.handle(), &resolved, sudo_password).await?;
            self.entries.lock().await.insert(
                handle_id.clone(),
                PreviewEntry {
                    session_id: session_id.clone(),
                    source_path: resolved.clone(),
                    local_path: path_buf.clone(),
                    kind: classified.clone(),
                    uses_sudo: fetch.uses_sudo,
                },
            );
            return Ok(text_preview_result(
                handle_id,
                classified,
                session_id,
                resolved,
                filename,
                extension,
                fetch.size.max(fetch.text.len() as u64),
                fetch.truncated,
                fetch.text,
                fetch.uses_sudo,
            ));
        }

        let (is_dir, total_size) = probe_ssh_file(&ssh.handle(), &resolved).await?;
        if is_dir {
            return Err(AppError::code("ERR_PREVIEW_IS_DIRECTORY"));
        }

        let preview_kind = resolve_preview_kind(&extension, total_size);
        if is_text_preview_kind(&preview_kind) {
            let fetch =
                fetch_remote_text_preview(&ssh.handle(), &resolved, sudo_password).await?;
            self.entries.lock().await.insert(
                handle_id.clone(),
                PreviewEntry {
                    session_id: session_id.clone(),
                    source_path: resolved.clone(),
                    local_path: path_buf.clone(),
                    kind: preview_kind.clone(),
                    uses_sudo: fetch.uses_sudo,
                },
            );
            return Ok(text_preview_result(
                handle_id,
                preview_kind,
                session_id,
                resolved,
                filename,
                extension,
                fetch.size.max(fetch.text.len() as u64),
                fetch.truncated,
                fetch.text,
                fetch.uses_sudo,
            ));
        }

        if preview_kind == "unsupported" {
            return Err(AppError::code("ERR_PREVIEW_UNSUPPORTED"));
        }

        let cache_path = materialize_for_preview(
            app,
            sessions,
            kind,
            &session_id,
            &path_buf,
            &resolved,
            total_size,
        )
        .await?;

        let result_kind = if matches!(preview_kind.as_str(), "image" | "pdf") {
            preview_kind
        } else {
            "unsupported".to_string()
        };

        self.entries.lock().await.insert(
            handle_id.clone(),
            PreviewEntry {
                session_id: session_id.clone(),
                source_path: resolved.clone(),
                local_path: cache_path.clone(),
                kind: result_kind.clone(),
                uses_sudo: false,
            },
        );

        Ok(PreviewOpenResult {
            handle_id,
            kind: result_kind,
            session_id,
            resolved_path: resolved,
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

pub async fn probe_path(
    sessions: &SessionManager,
    session_id: &str,
    path: &str,
) -> AppResult<String> {
    let ssh = sessions.ssh_snapshot(session_id).await?;
    let resolved = ssh.resolve_remote_path(path).await?;
    if sftp::is_remote_directory(&ssh.handle(), &resolved).await? {
        Ok("directory".to_string())
    } else {
        Ok("file".to_string())
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
        | "zsh" | "fish" | "sql" | "ini" | "cfg" | "conf" | "env" | "mod" | "sum" | "lock"
        | "gitignore" | "dockerignore" | "editorconfig" => "text".to_string(),
        _ => "unsupported".to_string(),
    }
}

fn resolve_preview_kind(extension: &str, total_size: u64) -> String {
    let kind = classify_preview_kind(extension);
    if kind != "unsupported" {
        return kind;
    }
    // Extensionless only (README, Dockerfile, /etc/hosts) — never guess `.img` etc. as text.
    if extension.is_empty() && total_size <= MAX_TEXT_PREVIEW_BYTES {
        return "text".to_string();
    }
    "unsupported".to_string()
}

fn is_text_preview_kind(kind: &str) -> bool {
    matches!(kind, "text" | "markdown" | "html" | "csv")
}

fn is_editable_kind(kind: &str) -> bool {
    is_text_preview_kind(kind)
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

struct RemoteTextPreview {
    size: u64,
    text: String,
    truncated: bool,
    uses_sudo: bool,
}

/// Single exec on the live SSH session: type/size/writable + file bytes.
/// Avoids a second SSH login and multiple SFTP handshakes (was ~3–4s at 100ms RTT).
async fn fetch_remote_text_preview(
    handle: &Arc<Mutex<russh::client::Handle<ClientHandler>>>,
    remote_path: &str,
    sudo_password: Option<&str>,
) -> AppResult<RemoteTextPreview> {
    let quoted = shell_quote_remote_path(remote_path);
    let limit = MAX_TEXT_PREVIEW_BYTES;
    let command = format!(
        r#"P={quoted}
L={limit}
if [ -d "$P" ]; then printf 'D\n'; exit 3; fi
if [ ! -e "$P" ] && [ ! -L "$P" ]; then printf 'E\n'; exit 4; fi
SZ=$(stat -c%s "$P" 2>/dev/null || stat -f%z "$P" 2>/dev/null || echo 0)
W=0
[ -w "$P" ] && W=1
printf 'F\t%s\t%s\n' "$SZ" "$W"
head -c "$L" "$P" 2>/dev/null || dd if="$P" bs=65536 count=$(( (L + 65535) / 65536 )) 2>/dev/null
"#,
    );

    match client::exec_command_capture(handle, &command, None).await {
        Ok((stdout, _stderr, code)) => {
            if code == 3 || stdout.starts_with('D') {
                return Err(AppError::code("ERR_PREVIEW_IS_DIRECTORY"));
            }
            if code == 4 || stdout.starts_with('E') {
                return Err(AppError::msg("No such file"));
            }
            if !stdout.starts_with("F\t") {
                return fetch_remote_text_preview_sudo(handle, remote_path, sudo_password).await;
            }
            let parsed = parse_remote_text_preview(&stdout, false)?;
            // Readable size but empty body + non-zero exit → likely permission on read.
            if code != 0 && parsed.size > 0 && parsed.text.is_empty() {
                return fetch_remote_text_preview_sudo(handle, remote_path, sudo_password).await;
            }
            Ok(parsed)
        }
        Err(err) if preview_sudo::is_permission_denied(&err) => {
            fetch_remote_text_preview_sudo(handle, remote_path, sudo_password).await
        }
        Err(err) => Err(err),
    }
}

async fn fetch_remote_text_preview_sudo(
    handle: &Arc<Mutex<russh::client::Handle<ClientHandler>>>,
    remote_path: &str,
    sudo_password: Option<&str>,
) -> AppResult<RemoteTextPreview> {
    let limit = MAX_TEXT_PREVIEW_BYTES as usize;
    let bytes =
        preview_sudo::read_remote_bytes_sudo(handle, remote_path, sudo_password, limit).await?;
    let truncated = bytes.len() >= limit;
    Ok(RemoteTextPreview {
        size: bytes.len() as u64,
        text: decode_text_bytes(&bytes),
        truncated,
        uses_sudo: true,
    })
}

fn parse_remote_text_preview(stdout: &str, uses_sudo: bool) -> AppResult<RemoteTextPreview> {
    let (meta, body) = match stdout.split_once('\n') {
        Some(pair) => pair,
        None => (stdout, ""),
    };
    if meta == "D" || meta.starts_with('D') {
        return Err(AppError::code("ERR_PREVIEW_IS_DIRECTORY"));
    }
    if meta == "E" || meta.starts_with('E') {
        return Err(AppError::msg("No such file"));
    }
    if !meta.starts_with('F') {
        return Err(AppError::msg("Failed to read remote file"));
    }
    let mut parts = meta.split('\t');
    let _ = parts.next();
    let size = parts
        .next()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);
    let writable = parts.next().unwrap_or("0") == "1";
    let truncated = size > MAX_TEXT_PREVIEW_BYTES || body.len() as u64 >= MAX_TEXT_PREVIEW_BYTES;
    Ok(RemoteTextPreview {
        size,
        text: body.to_string(),
        truncated,
        // Mark sudo when not writable so save can escalate (world-readable root files).
        uses_sudo: uses_sudo || !writable,
    })
}

#[cfg(test)]
mod preview_fetch_tests {
    use super::*;

    #[test]
    fn parse_small_shell_script() {
        let out = "F\t1234\t1\n#!/bin/bash\necho hi\n";
        let parsed = parse_remote_text_preview(out, false).unwrap();
        assert_eq!(parsed.size, 1234);
        assert!(parsed.text.starts_with("#!/bin/bash"));
        assert!(!parsed.uses_sudo);
    }

    #[test]
    fn parse_readonly_sets_sudo_flag() {
        let out = "F\t10\t0\nhello\n";
        let parsed = parse_remote_text_preview(out, false).unwrap();
        assert!(parsed.uses_sudo);
    }
}

async fn probe_ssh_file(
    handle: &Arc<Mutex<russh::client::Handle<ClientHandler>>>,
    path: &str,
) -> AppResult<(bool, u64)> {
    match sftp::remote_path_stat(handle, path).await {
        Ok(stat) => Ok(stat),
        Err(err) if preview_sudo::is_permission_denied(&err) => {
            if path.ends_with('/') {
                return Err(AppError::code("ERR_PREVIEW_IS_DIRECTORY"));
            }
            Ok((false, 0))
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

    let _ = kind;
    // Reuse the live session — previews are small; a second SSH login is the slow path.
    let ssh = sessions.ssh_snapshot(session_id).await?;
    sftp::download_file(&ssh.handle(), remote_path, &cache_path, None, |_, _| {})
        .await?;
    Ok(cache_path)
}

fn preview_cache_dir(app: &AppHandle, session_id: &str) -> AppResult<PathBuf> {
    let base = app
        .path()
        .cache_dir()
        .map_err(|e| AppError::msg(e.to_string()))?;
    Ok(base.join("preview").join(session_id))
}

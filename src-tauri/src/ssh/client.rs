use std::path::{Path, PathBuf};
use std::sync::Arc;

use std::io::Cursor;

use russh::client;
use russh_keys::key::PublicKey;
use russh::ChannelMsg;
use russh_keys::load_secret_key;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, watch, Mutex};
use tokio::time::{sleep, Duration};

use crate::error::{AppError, AppResult};
use crate::session::{expand_path, SessionManager};
use crate::ssh::{probe, sftp};
use crate::types::{
    DownloadFileRequest, SessionInfo, SessionKind, SshConnectRequest, TerminalOutputPayload,
    TransferCompletePayload, TransferProgressPayload, UploadFileResult, UploadFilesRequest,
};
use crate::types::{AuthMethod, InsertLocalPathsRequest};

pub struct ClientHandler;

#[async_trait::async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

pub struct SshSession {
    info: SessionInfo,
    connect_request: SshConnectRequest,
    handle: Arc<Mutex<client::Handle<ClientHandler>>>,
    remote_cwd: Arc<Mutex<String>>,
    input_tx: mpsc::UnboundedSender<Vec<u8>>,
    resize_tx: mpsc::UnboundedSender<(u16, u16)>,
    shutdown_tx: watch::Sender<bool>,
}

/// Short-lived SSH connection used only for file transfer (not shared with the shell).
pub struct TransferConnection {
    handle: Arc<Mutex<client::Handle<ClientHandler>>>,
}

impl TransferConnection {
    pub fn handle(&self) -> Arc<Mutex<client::Handle<ClientHandler>>> {
        self.handle.clone()
    }
}

#[derive(Clone)]
pub struct SshSessionSnapshot {
    handle: Arc<Mutex<client::Handle<ClientHandler>>>,
    remote_cwd: Arc<Mutex<String>>,
    info: SessionInfo,
    connect_request: SshConnectRequest,
}

fn ssh_client_config() -> Arc<client::Config> {
    Arc::new(client::Config {
        inactivity_timeout: Some(Duration::from_secs(3600)),
        window_size: 16 * 1024 * 1024,
        maximum_packet_size: 64 * 1024,
        ..Default::default()
    })
}

async fn authenticate_handle(
    handle: &mut client::Handle<ClientHandler>,
    request: &SshConnectRequest,
) -> AppResult<()> {
    let auth_ok = match request.auth_method {
        AuthMethod::Password => {
            let password = request
                .password
                .as_ref()
                .filter(|p| !p.is_empty())
                .ok_or_else(|| AppError::msg("请输入密码"))?;
            handle
                .authenticate_password(&request.username, password)
                .await?
        }
        AuthMethod::PrivateKey => {
            let key_path = request
                .private_key_path
                .as_ref()
                .ok_or_else(|| AppError::msg("Private key path is required"))?;
            let expanded = expand_path(key_path)?;
            let key_pair = load_secret_key(&expanded, request.passphrase.as_deref())?;
            handle
                .authenticate_publickey(&request.username, Arc::new(key_pair))
                .await?
        }
    };

    if !auth_ok {
        return Err(AppError::msg("密码错误或认证失败"));
    }
    Ok(())
}

pub async fn exec_command(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    command: &str,
) -> AppResult<String> {
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

    let mut stdout = String::new();
    let mut exit_status: Option<u32> = None;
    let mut channel = channel;

    loop {
        match channel.wait().await {
            Some(ChannelMsg::Data { data }) => {
                stdout.push_str(&String::from_utf8_lossy(data.as_ref()));
            }
            Some(ChannelMsg::ExtendedData { data, .. }) => {
                stdout.push_str(&String::from_utf8_lossy(data.as_ref()));
            }
            Some(ChannelMsg::ExitStatus { exit_status: code }) => {
                exit_status = Some(code);
            }
            Some(ChannelMsg::Close | ChannelMsg::Eof) | None => break,
            _ => {}
        }
    }

    match exit_status {
        Some(0) | None => Ok(stdout),
        Some(code) => {
            let detail = stdout.trim();
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

pub async fn open_transfer_connection(
    request: &SshConnectRequest,
    cancel: Option<&std::sync::atomic::AtomicBool>,
) -> AppResult<TransferConnection> {
    use crate::transfer::{check_cancel, CANCELLED_MSG, CANCEL_POLL_MS};
    use std::sync::atomic::Ordering;
    use std::time::Duration;

    check_cancel(cancel)?;

    let connect = async {
        let config = ssh_client_config();
        let mut handle =
            client::connect(config, (request.host.as_str(), request.port), ClientHandler)
                .await
                .map_err(AppError::from)?;
        authenticate_handle(&mut handle, request).await?;
        Ok::<_, AppError>(Arc::new(Mutex::new(handle)))
    };

    let handle = if let Some(flag) = cancel {
        async fn wait_for_cancel_flag(flag: &std::sync::atomic::AtomicBool) {
            loop {
                if flag.load(Ordering::SeqCst) {
                    return;
                }
                tokio::time::sleep(Duration::from_millis(CANCEL_POLL_MS)).await;
            }
        }

        tokio::select! {
            result = connect => result?,
            () = wait_for_cancel_flag(flag) => {
                return Err(AppError::msg(CANCELLED_MSG));
            }
        }
    } else {
        connect.await?
    };

    Ok(TransferConnection { handle })
}

impl SshSession {
    pub async fn connect(
        app: AppHandle,
        id: String,
        request: SshConnectRequest,
        cols: u16,
        rows: u16,
    ) -> AppResult<(Self, Option<probe::ServerOsProfile>)> {
        let config = ssh_client_config();

        let mut handle = client::connect(config, (request.host.as_str(), request.port), ClientHandler)
            .await?;

        authenticate_handle(&mut handle, &request).await?;

        let os_profile = probe::probe_remote_os(&handle).await.ok();
        let remote_home = sftp::resolve_remote_home(&handle).await?;
        let remote_cwd = Arc::new(Mutex::new(remote_home.clone()));
        let handle = Arc::new(Mutex::new(handle));

        let (input_tx, input_rx) = mpsc::unbounded_channel();
        let (resize_tx, resize_rx) = mpsc::unbounded_channel();
        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        let app_clone = app.clone();
        let session_id = id.clone();
        let handle_clone = handle.clone();
        let remote_home_for_shell = remote_home.clone();
        let cwd_clone = remote_cwd.clone();

        tokio::spawn(async move {
            if let Err(err) = run_shell_loop(
                app_clone,
                session_id,
                handle_clone,
                remote_home_for_shell,
                cwd_clone,
                input_rx,
                resize_rx,
                shutdown_rx,
                cols,
                rows,
            )
            .await
            {
                log::error!("SSH shell loop ended: {err}");
            }
        });

        let title = request
            .session_title
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("{}@{}", request.username, request.host));
        let server_id = format!(
            "{}@{}:{}",
            request.username, request.host, request.port
        );
        let info = SessionInfo {
            id,
            title,
            kind: SessionKind::Ssh,
            remote_home: Some(remote_home.clone()),
            server_id: Some(server_id),
            os_id: os_profile.as_ref().map(|os| os.os_id.clone()),
            os_name: os_profile.as_ref().and_then(|os| os.os_name.clone()),
        };

        Ok((
            Self {
                info,
                connect_request: request,
                handle,
                remote_cwd,
                input_tx,
                resize_tx,
                shutdown_tx,
            },
            os_profile,
        ))
    }

    pub fn info(&self) -> SessionInfo {
        self.info.clone()
    }

    pub fn handle(&self) -> Arc<Mutex<client::Handle<ClientHandler>>> {
        self.handle.clone()
    }

    pub async fn current_remote_cwd(&self) -> String {
        self.remote_cwd.lock().await.clone()
    }

    pub async fn probe_path_kind(&self, path: &str) -> AppResult<&'static str> {
        let resolved = self.resolve_remote_path(path).await?;
        if sftp::is_remote_directory(&self.handle, &resolved).await? {
            Ok("directory")
        } else {
            Ok("file")
        }
    }

    pub fn snapshot(&self) -> SshSessionSnapshot {
        SshSessionSnapshot {
            handle: self.handle.clone(),
            remote_cwd: self.remote_cwd.clone(),
            info: self.info.clone(),
            connect_request: self.connect_request.clone(),
        }
    }

    pub fn write_input(&self, data: &str) -> AppResult<()> {
        self.input_tx
            .send(data.as_bytes().to_vec())
            .map_err(|_| AppError::msg("终端连接已断开，请关闭此标签页后重新连接"))
    }

    pub fn resize(&self, cols: u16, rows: u16) -> AppResult<()> {
        self.resize_tx
            .send((cols, rows))
            .map_err(|e| AppError::msg(e.to_string()))
    }

    pub fn close(&mut self) -> AppResult<()> {
        let _ = self.shutdown_tx.send(true);
        Ok(())
    }

    pub async fn upload_files(
        &self,
        app: AppHandle,
        request: UploadFilesRequest,
        transfer_id: &str,
        cancel: Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
    ) -> AppResult<Vec<UploadFileResult>> {
        self.snapshot()
            .upload_files(app, request, transfer_id, cancel)
            .await
    }

    pub async fn resolve_remote_path(&self, remote_path: &str) -> AppResult<String> {
        self.snapshot().resolve_remote_path(remote_path).await
    }

    pub async fn enter_remote_directory(&mut self, remote_path: &str) -> AppResult<()> {
        let cd_target = remote_path.trim().trim_end_matches('/');
        if cd_target.is_empty() || cd_target == "." {
            self.write_input("ls -F\r")?;
            return Ok(());
        }

        let cmd = format!("cd {} && ls -F\r", crate::shell::shell_cd_argument(cd_target));
        self.write_input(&cmd)?;

        let resolved = self.resolve_remote_path(cd_target).await?;
        *self.remote_cwd.lock().await = resolved;
        Ok(())
    }

    pub async fn download_file(
        &self,
        app: AppHandle,
        request: DownloadFileRequest,
        transfer_id: &str,
        cancel: Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
    ) -> AppResult<String> {
        self.snapshot()
            .download_file(app, request, transfer_id, cancel)
            .await
    }

    pub async fn exec_command(&self, command: &str) -> AppResult<String> {
        exec_command(&self.handle, command).await
    }
}

impl SshSessionSnapshot {
    pub fn handle(&self) -> Arc<Mutex<client::Handle<ClientHandler>>> {
        self.handle.clone()
    }

    pub async fn current_remote_cwd(&self) -> String {
        self.remote_cwd.lock().await.clone()
    }

    pub fn session_id(&self) -> String {
        self.info.id.clone()
    }

    pub fn connect_request(&self) -> &SshConnectRequest {
        &self.connect_request
    }

    pub async fn upload_files(
        &self,
        app: AppHandle,
        request: UploadFilesRequest,
        transfer_id: &str,
        cancel: Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
    ) -> AppResult<Vec<UploadFileResult>> {
        let remote_dir = match request.remote_dir.filter(|d| !d.is_empty()) {
            Some(dir) => dir,
            None => self.remote_cwd.lock().await.clone(),
        };

        let transfer =
            open_transfer_connection(&self.connect_request, cancel.as_deref()).await?;
        let handle = transfer.handle();
        let session_id = self.info.id.clone();
        let mut results = Vec::new();

        for local_path in request.local_paths {
            let local = PathBuf::from(&local_path);
            if !local.exists() {
                return Err(AppError::msg(format!("Local file not found: {local_path}")));
            }

            let file_name = local
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| AppError::msg("Invalid file name"))?;
            let remote_path = format!("{}/{}", remote_dir.trim_end_matches('/'), file_name);

            let total = std::fs::metadata(&local)?.len();
            let app_progress = app.clone();
            let sid = session_id.clone();
            let tid = transfer_id.to_string();
            let fname = file_name.to_string();

            match sftp::upload_file(
                &handle,
                &local,
                &remote_path,
                cancel.clone(),
                move |transferred| {
                    let _ = app_progress.emit(
                        "transfer-progress",
                        TransferProgressPayload {
                            transfer_id: tid.clone(),
                            session_id: sid.clone(),
                            filename: fname.clone(),
                            transferred,
                            total,
                            direction: "upload".to_string(),
                        },
                    );
                },
            )
            .await
            {
                Ok(()) => {}
                Err(err) if err.is_cancelled() => {
                    let _ = sftp::remove_remote_file(&handle, &remote_path).await;
                    return Err(err);
                }
                Err(err) => return Err(err),
            }

            results.push(UploadFileResult {
                filename: file_name.to_string(),
                remote_path,
                local_path,
            });
        }

        Ok(results)
    }

    pub async fn resolve_remote_path(&self, remote_path: &str) -> AppResult<String> {
        let path = sanitize_shell_path(remote_path)
            .trim()
            .trim_end_matches('/')
            .to_string();
        if path.is_empty() {
            return Err(AppError::msg("Path is empty"));
        }

        let home = self
            .info
            .remote_home
            .clone()
            .unwrap_or_else(|| "/".to_string());

        if path.starts_with("~/") {
            return Ok(format!("{}/{}", home.trim_end_matches('/'), &path[2..]));
        }
        if path == "~" {
            return Ok(home);
        }
        if path.starts_with('/') {
            return Ok(path);
        }
        if path == ".." {
            let cwd = self.remote_cwd.lock().await.clone();
            let trimmed = cwd.trim_end_matches('/');
            if trimmed.is_empty() || trimmed == "/" {
                return Ok("/".to_string());
            }
            if let Some((parent, _)) = trimmed.rsplit_once('/') {
                return Ok(if parent.is_empty() {
                    "/".to_string()
                } else {
                    parent.to_string()
                });
            }
            return Ok("/".to_string());
        }

        let cwd = self.remote_cwd.lock().await.clone();
        Ok(format!("{}/{}", cwd.trim_end_matches('/'), path))
    }

    pub async fn download_file(
        &self,
        app: AppHandle,
        request: DownloadFileRequest,
        transfer_id: &str,
        cancel: Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
    ) -> AppResult<String> {
        let remote_path = self.resolve_remote_path(&request.remote_path).await?;

        let file_name = Path::new(&remote_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("download.bin");

        let local_path = if let Some(path) = request.local_path {
            path
        } else {
            let download_dir = crate::session::default_download_dir()?;
            std::fs::create_dir_all(&download_dir)?;
            format!("{download_dir}/{file_name}")
        };

        let local = PathBuf::from(&local_path);
        if let Some(parent) = local.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let transfer =
            open_transfer_connection(&self.connect_request, cancel.as_deref()).await?;
        let handle = transfer.handle();
        let session_id = self.info.id.clone();
        let fname = file_name.to_string();
        let tid = transfer_id.to_string();

        match sftp::download_file(
            &handle,
            &remote_path,
            &local,
            cancel,
            move |transferred, total| {
                let _ = app.emit(
                    "transfer-progress",
                    TransferProgressPayload {
                        transfer_id: tid.clone(),
                        session_id: session_id.clone(),
                        filename: fname.clone(),
                        transferred,
                        total,
                        direction: "download".to_string(),
                    },
                );
            },
        )
        .await
        {
            Ok(()) => Ok(local_path),
            Err(err) if err.is_cancelled() => {
                let _ = tokio::fs::remove_file(&local).await;
                Err(err)
            }
            Err(err) => Err(err),
        }
    }
}

async fn open_shell_channel(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
    cols: u16,
    rows: u16,
) -> AppResult<russh::Channel<client::Msg>> {
    let channel = {
        let handle_guard = handle.lock().await;
        handle_guard.channel_open_session().await?
    };

    channel
        .request_pty(
            false,
            "xterm-256color",
            u32::from(cols),
            u32::from(rows),
            0,
            0,
            &[],
        )
        .await?;
    channel.request_shell(false).await?;
    Ok(channel)
}

async fn run_shell_loop(
    app: AppHandle,
    session_id: String,
    handle: Arc<Mutex<client::Handle<ClientHandler>>>,
    remote_home: String,
    remote_cwd: Arc<Mutex<String>>,
    mut input_rx: mpsc::UnboundedReceiver<Vec<u8>>,
    mut resize_rx: mpsc::UnboundedReceiver<(u16, u16)>,
    mut shutdown_rx: watch::Receiver<bool>,
    cols: u16,
    rows: u16,
) -> AppResult<()> {
    let mut cols = cols;
    let mut rows = rows;
    let mut reconnected = false;

    loop {
        if *shutdown_rx.borrow() {
            break;
        }

        let mut channel = match open_shell_channel(&handle, cols, rows).await {
            Ok(channel) => channel,
            Err(err) => {
                log::error!("Failed to open SSH shell for {session_id}: {err}");
                crate::session::SessionManager::emit_terminal_message(
                    &app,
                    &session_id,
                    "SSH 连接已断开，请关闭此标签页后重新连接。",
                );
                break;
            }
        };

        if reconnected {
            let cwd = remote_cwd.lock().await.clone();
            if cwd != remote_home {
                let cd_cmd = format!("cd {}\r", crate::shell::shell_cd_argument(&cwd));
                if channel
                    .data(Cursor::new(cd_cmd.into_bytes()))
                    .await
                    .is_err()
                {
                    continue;
                }
            }
        }

        let should_reconnect = run_single_shell(
            &app,
            &session_id,
            &remote_home,
            &remote_cwd,
            &mut channel,
            &mut input_rx,
            &mut resize_rx,
            &mut cols,
            &mut rows,
            &mut shutdown_rx,
        )
        .await;

        if *shutdown_rx.borrow() {
            break;
        }

        if should_reconnect {
            reconnected = true;
            crate::session::SessionManager::emit_terminal_message(
                &app,
                &session_id,
                "远程 Shell 已断开，正在重新连接…",
            );
            sleep(Duration::from_millis(300)).await;
            continue;
        }

        break;
    }

    Ok(())
}

async fn run_single_shell(
    app: &AppHandle,
    session_id: &str,
    remote_home: &str,
    remote_cwd: &Arc<Mutex<String>>,
    channel: &mut russh::Channel<client::Msg>,
    input_rx: &mut mpsc::UnboundedReceiver<Vec<u8>>,
    resize_rx: &mut mpsc::UnboundedReceiver<(u16, u16)>,
    cols: &mut u16,
    rows: &mut u16,
    shutdown_rx: &mut watch::Receiver<bool>,
) -> bool {
    loop {
        if *shutdown_rx.borrow() {
            return false;
        }

        tokio::select! {
            biased;
            changed = shutdown_rx.changed() => {
                if changed.is_err() || *shutdown_rx.borrow() {
                    return false;
                }
            }
            Some(data) = input_rx.recv() => {
                update_cwd_from_input(remote_cwd, remote_home, &data).await;
                if channel.data(Cursor::new(data)).await.is_err() {
                    return true;
                }
            }
            Some((new_cols, new_rows)) = resize_rx.recv() => {
                *cols = new_cols;
                *rows = new_rows;
                if channel
                    .window_change(u32::from(new_cols), u32::from(new_rows), 0, 0)
                    .await
                    .is_err()
                {
                    return true;
                }
            }
            msg = channel.wait() => {
                match msg {
                    Some(ChannelMsg::Data { data }) => {
                        let text = String::from_utf8_lossy(&data).to_string();
                        update_cwd_from_output(remote_cwd, &text).await;
                        let _ = app.emit(
                            "terminal-output",
                            TerminalOutputPayload {
                                session_id: session_id.to_string(),
                                data: text,
                            },
                        );
                    }
                    Some(ChannelMsg::ExitStatus { .. })
                    | Some(ChannelMsg::Close)
                    | Some(ChannelMsg::Eof)
                    | None => {
                        return true;
                    }
                    _ => {}
                }
            }
        }
    }
}

async fn update_cwd_from_input(
    remote_cwd: &Arc<Mutex<String>>,
    remote_home: &str,
    data: &[u8],
) {
    let text = String::from_utf8_lossy(data);
    if text.contains("\r") || text.contains("\n") {
        if let Some(cmd) = extract_command(&text) {
            if cmd == "cd" {
                *remote_cwd.lock().await = remote_home.to_string();
                return;
            }
            if cmd.starts_with("cd ") {
                let target = cmd[3..].trim();
                let mut cwd = remote_cwd.lock().await;
                apply_cd_target(&mut cwd, remote_home, target);
            }
        }
    }
}

fn apply_cd_target(cwd: &mut String, remote_home: &str, target: &str) {
    if target.is_empty() {
        *cwd = remote_home.to_string();
        return;
    }
    if target.starts_with('/') {
        *cwd = target.to_string();
        return;
    }
    if target == "~" {
        *cwd = remote_home.to_string();
        return;
    }
    if target.starts_with("~/") {
        *cwd = format!("{}/{}", remote_home.trim_end_matches('/'), &target[2..]);
        return;
    }
    if target == ".." {
        let trimmed = cwd.trim_end_matches('/');
        if trimmed.is_empty() || trimmed == "/" {
            *cwd = "/".to_string();
            return;
        }
        if let Some((parent, _)) = trimmed.rsplit_once('/') {
            *cwd = if parent.is_empty() {
                "/".to_string()
            } else {
                parent.to_string()
            };
        } else {
            *cwd = "/".to_string();
        }
        return;
    }
    *cwd = format!("{}/{}", cwd.trim_end_matches('/'), target);
}

async fn update_cwd_from_output(_remote_cwd: &Arc<Mutex<String>>, _text: &str) {
    // MVP: rely on cd tracking from input; OSC7 can be added later.
}

fn extract_command(text: &str) -> Option<String> {
    text.split(['\r', '\n'])
        .last()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| line.to_string())
}

pub async fn insert_local_paths(
    sessions: &SessionManager,
    request: InsertLocalPathsRequest,
) -> AppResult<String> {
    let quoted: Vec<String> = request
        .local_paths
        .iter()
        .map(|path| {
            let escaped = path.replace('\\', "\\\\").replace('"', "\\\"");
            format!("\"{escaped}\"")
        })
        .collect();
    let payload = format!("{} ", quoted.join(" "));
    sessions
        .write_input(&request.session_id, &payload)
        .await?;
    Ok(payload)
}

pub fn emit_transfer_progress(
    app: &AppHandle,
    transfer_id: &str,
    session_id: &str,
    filename: &str,
    transferred: u64,
    total: u64,
    direction: &str,
) {
    let _ = app.emit(
        "transfer-progress",
        TransferProgressPayload {
            transfer_id: transfer_id.to_string(),
            session_id: session_id.to_string(),
            filename: filename.to_string(),
            transferred,
            total,
            direction: direction.to_string(),
        },
    );
}

/// Strip shell-style quotes from path segments, e.g. `~/'下载'` → `~/下载`.
fn sanitize_shell_path(path: &str) -> String {
    let trimmed = path.trim();
    if (trimmed.starts_with('\'') && trimmed.ends_with('\''))
        || (trimmed.starts_with('"') && trimmed.ends_with('"'))
    {
        return trimmed[1..trimmed.len() - 1].to_string();
    }

    let mut out = String::with_capacity(trimmed.len());
    let chars: Vec<char> = trimmed.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '/'
            && i + 1 < chars.len()
            && (chars[i + 1] == '\'' || chars[i + 1] == '"')
        {
            let quote = chars[i + 1];
            out.push('/');
            i += 2;
            while i < chars.len() && chars[i] != quote {
                out.push(chars[i]);
                i += 1;
            }
            if i < chars.len() {
                i += 1;
            }
            continue;
        }

        if i == 0 && chars[i] == '~' && i + 1 < chars.len() && chars[i + 1] == '/' {
            out.push('~');
            out.push('/');
            i += 2;
            if i < chars.len() && (chars[i] == '\'' || chars[i] == '"') {
                let quote = chars[i];
                i += 1;
                while i < chars.len() && chars[i] != quote {
                    out.push(chars[i]);
                    i += 1;
                }
                if i < chars.len() {
                    i += 1;
                }
            }
            continue;
        }

        out.push(chars[i]);
        i += 1;
    }

    out
}

#[cfg(test)]
mod path_tests {
    use super::sanitize_shell_path;

    #[test]
    fn quoted_segment_after_tilde() {
        assert_eq!(sanitize_shell_path("~/'下载'"), "~/下载");
    }

    #[test]
    fn quoted_absolute_segment() {
        assert_eq!(sanitize_shell_path("/'My Dir'/file.txt"), "/My Dir/file.txt");
    }
}

pub fn emit_transfer_complete(
    app: &AppHandle,
    transfer_id: &str,
    session_id: &str,
    direction: &str,
    message: &str,
    success: bool,
    filenames: Vec<String>,
    local_path: Option<String>,
) {
    let _ = app.emit(
        "transfer-complete",
        TransferCompletePayload {
            transfer_id: transfer_id.to_string(),
            session_id: session_id.to_string(),
            message: message.to_string(),
            success,
            direction: direction.to_string(),
            filenames,
            local_path,
        },
    );
}

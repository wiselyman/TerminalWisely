use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::session::{
    load_connections, record_device_history, request_from_device, request_from_saved,
    saved_connection_from_request, store_connections, update_matching_saved_connections_os,
    SessionManager,
};
use crate::ssh::client::{emit_transfer_complete, insert_local_paths};
use crate::transfer::CANCELLED_MSG;
use crate::transfer::TransferRegistry;
use crate::types::{
    AuthMethod, DeviceRecord, DownloadFileRequest, EnterDirectoryRequest,
    InsertLocalPathsRequest, InsertTerminalCommandRequest, KillProcessRequest, ListProcessesRequest, PreviewCloseRequest,
    PreviewOpenRequest, PreviewOpenResult, ProbePathRequest, ProbeRemotePathRequest,
    FindFilesRequest, FindFilesResult,
    FsMoveRequest, FsPathRequest, FsRenameRequest,
    HostStatsRequest, HostStatsSnapshot,
    ProcessListResult, SavedConnectionView, SessionCwdRequest, SessionInfo, SessionMetadataUpdated,
    SshConnectRequest, SshConnectResult,
    TransferRemoteRequest, UploadFileResult, UploadFilesRequest,
};

fn spawn_ssh_post_connect_tasks(
    app: AppHandle,
    request: SshConnectRequest,
    session_id: String,
) {
    tauri::async_runtime::spawn(async move {
        let sessions = app.state::<SessionManager>();
        let probe_result = sessions.probe_ssh_metadata(&session_id).await;
        let os_profile = probe_result.as_ref().ok().and_then(|value| value.clone());
        if let Some(ref os) = os_profile {
            let _ = update_matching_saved_connections_os(&app, &request, os);
        }
        if probe_result.is_ok() {
            let session_info = sessions
                .list()
                .await
                .into_iter()
                .find(|item| item.id == session_id);
            let payload = SessionMetadataUpdated {
                session_id: session_id.clone(),
                os_id: session_info
                    .as_ref()
                    .and_then(|s| s.os_id.clone())
                    .or_else(|| os_profile.as_ref().map(|os| os.os_id.clone())),
                os_name: session_info
                    .as_ref()
                    .and_then(|s| s.os_name.clone())
                    .or_else(|| os_profile.as_ref().and_then(|os| os.os_name.clone())),
                remote_home: session_info.and_then(|s| s.remote_home),
            };
            let _ = app.emit("session-metadata-updated", payload);
        }
        let _ = record_device_history(&app, &request);
    });
}

#[tauri::command]
pub async fn create_ssh_session(
    app: AppHandle,
    request: SshConnectRequest,
    cols: u16,
    rows: u16,
    sessions: State<'_, SessionManager>,
) -> Result<SshConnectResult, String> {
    let (info, _os_profile) = sessions
        .create_ssh(app.clone(), request.clone(), cols, rows)
        .await
        .map_err(|e| e.to_string())?;
    spawn_ssh_post_connect_tasks(app.clone(), request.clone(), info.id.clone());
    Ok(SshConnectResult {
        session: info,
        os_id: None,
        os_name: None,
    })
}

#[tauri::command]
pub async fn terminal_input(
    session_id: String,
    data: String,
    sessions: State<'_, SessionManager>,
) -> Result<(), String> {
    sessions
        .write_input(&session_id, &data)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resize_terminal(
    session_id: String,
    cols: u16,
    rows: u16,
    sessions: State<'_, SessionManager>,
) -> Result<(), String> {
    sessions
        .resize(&session_id, cols, rows)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reconnect_ssh_session(
    app: AppHandle,
    session_id: String,
    cols: u16,
    rows: u16,
    sessions: State<'_, SessionManager>,
) -> Result<(), String> {
    sessions
        .reconnect_ssh(app, &session_id, cols, rows)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn close_session(
    session_id: String,
    sessions: State<'_, SessionManager>,
    previews: State<'_, crate::preview::PreviewManager>,
) -> Result<(), String> {
    previews.close_session(&session_id).await;
    sessions.close(&session_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_sessions(sessions: State<'_, SessionManager>) -> Result<Vec<SessionInfo>, String> {
    Ok(sessions.list().await)
}

#[tauri::command]
pub async fn upload_files(
    app: AppHandle,
    request: UploadFilesRequest,
    sessions: State<'_, SessionManager>,
) -> Result<Vec<UploadFileResult>, String> {
    let session_id = request.session_id.clone();
    let transfer_id = TransferRegistry::resolve_transfer_id(request.transfer_id.clone());
    let results = match sessions.upload_files(app.clone(), request).await {
        Ok(results) => results,
        Err(err) if err.is_cancelled() => {
            emit_transfer_complete(
                &app,
                &transfer_id,
                &session_id,
                "upload",
                CANCELLED_MSG,
                false,
                vec![],
                None,
            );
            return Err(CANCELLED_MSG.to_string());
        }
        Err(err) => return Err(err.to_string()),
    };

    let filenames: Vec<String> = results.iter().map(|r| r.filename.clone()).collect();
    let message = if results.len() == 1 {
        format!("已上传: {}", results[0].filename)
    } else {
        format!("已上传 {} 个文件", results.len())
    };

    emit_transfer_complete(
        &app,
        &transfer_id,
        &session_id,
        "upload",
        &message,
        true,
        filenames.clone(),
        None,
    );

    if !results.is_empty() {
        sessions
            .write_input(&session_id, "ls\r")
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(results)
}

#[tauri::command]
pub async fn download_file(
    app: AppHandle,
    request: DownloadFileRequest,
    sessions: State<'_, SessionManager>,
) -> Result<String, String> {
    let session_id = request.session_id.clone();
    let transfer_id = TransferRegistry::resolve_transfer_id(request.transfer_id.clone());
    let local_path = match sessions.download_file(app.clone(), request).await {
        Ok(path) => path,
        Err(err) if err.is_cancelled() => {
            emit_transfer_complete(
                &app,
                &transfer_id,
                &session_id,
                "download",
                CANCELLED_MSG,
                false,
                vec![],
                None,
            );
            return Err(CANCELLED_MSG.to_string());
        }
        Err(err) => return Err(err.to_string()),
    };

    if let Err(err) = app.opener().reveal_item_in_dir(&local_path) {
        log::warn!("Failed to reveal download folder: {err}");
    }

    let file_name = std::path::Path::new(&local_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");

    emit_transfer_complete(
        &app,
        &transfer_id,
        &session_id,
        "download",
        &format!("已下载: {file_name}"),
        true,
        vec![],
        Some(local_path.clone()),
    );

    Ok(local_path)
}

#[tauri::command]
pub async fn download_directory(
    app: AppHandle,
    request: DownloadFileRequest,
    sessions: State<'_, SessionManager>,
) -> Result<String, String> {
    let session_id = request.session_id.clone();
    let transfer_id = TransferRegistry::resolve_transfer_id(request.transfer_id.clone());
    let local_path = match sessions.download_directory(app.clone(), request).await {
        Ok(path) => path,
        Err(err) if err.is_cancelled() => {
            emit_transfer_complete(
                &app,
                &transfer_id,
                &session_id,
                "download",
                CANCELLED_MSG,
                false,
                vec![],
                None,
            );
            return Err(CANCELLED_MSG.to_string());
        }
        Err(err) => return Err(err.to_string()),
    };

    if let Err(err) = app.opener().reveal_item_in_dir(&local_path) {
        log::warn!("Failed to reveal download folder: {err}");
    }

    let file_name = std::path::Path::new(&local_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("folder.tar.gz");

    emit_transfer_complete(
        &app,
        &transfer_id,
        &session_id,
        "download",
        &format!("已打包下载: {file_name}"),
        true,
        vec![],
        Some(local_path.clone()),
    );

    Ok(local_path)
}

#[tauri::command]
pub async fn cancel_transfer(
    #[allow(non_snake_case)]
    transferId: String,
    sessions: State<'_, SessionManager>,
) -> Result<bool, String> {
    Ok(sessions.cancel_transfer(&transferId).await)
}

#[tauri::command]
pub async fn probe_remote_path(
    request: ProbeRemotePathRequest,
    sessions: State<'_, SessionManager>,
) -> Result<String, String> {
    sessions
        .probe_remote_path(request)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn transfer_remote_file(
    app: AppHandle,
    request: TransferRemoteRequest,
    sessions: State<'_, SessionManager>,
) -> Result<(), String> {
    sessions
        .transfer_remote_file(app, request)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn enter_directory(
    request: EnterDirectoryRequest,
    sessions: State<'_, SessionManager>,
) -> Result<(), String> {
    sessions
        .enter_directory(&request.session_id, &request.path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_path(
    request: FsRenameRequest,
    sessions: State<'_, SessionManager>,
) -> Result<(), String> {
    sessions
        .rename_path(
            &request.session_id,
            &request.path,
            &request.new_name,
            request.sudo_password.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_path(
    request: FsPathRequest,
    sessions: State<'_, SessionManager>,
) -> Result<(), String> {
    sessions
        .delete_path(
            &request.session_id,
            &request.path,
            request.sudo_password.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn move_path(
    request: FsMoveRequest,
    sessions: State<'_, SessionManager>,
) -> Result<(), String> {
    sessions
        .move_path(
            &request.session_id,
            &request.path,
            &request.dest_dir,
            request.sudo_password.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn compress_path(
    request: FsPathRequest,
    sessions: State<'_, SessionManager>,
) -> Result<(), String> {
    sessions
        .compress_path(
            &request.session_id,
            &request.path,
            request.sudo_password.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn extract_archive(
    request: FsPathRequest,
    sessions: State<'_, SessionManager>,
) -> Result<(), String> {
    sessions
        .extract_archive(
            &request.session_id,
            &request.path,
            request.sudo_password.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn insert_local_paths_command(
    request: InsertLocalPathsRequest,
    sessions: State<'_, SessionManager>,
) -> Result<String, String> {
    insert_local_paths(&sessions, request)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn insert_terminal_command(
    request: InsertTerminalCommandRequest,
    sessions: State<'_, SessionManager>,
) -> Result<(), String> {
    sessions
        .write_input(&request.session_id, &request.command)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_saved_connections(app: AppHandle) -> Result<Vec<SavedConnectionView>, String> {
    load_connections(&app)
        .map(|connections| connections.iter().map(SavedConnectionView::from).collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_connection(
    app: AppHandle,
    name: String,
    request: SshConnectRequest,
    remember_password: bool,
    os_id: Option<String>,
    os_name: Option<String>,
) -> Result<SavedConnectionView, String> {
    let mut connections = load_connections(&app).map_err(|e| e.to_string())?;
    let mut saved = saved_connection_from_request(&name, &request);
    saved.os_id = os_id;
    saved.os_name = os_name;
    if remember_password && request.auth_method == AuthMethod::Password {
        saved.password = request.password.clone();
    }
    if let Some(index) = connections.iter().position(|connection| {
        connection.host == request.host
            && connection.port == request.port
            && connection.username == request.username
    }) {
        saved.id = connections[index].id.clone();
        if !remember_password || request.auth_method != AuthMethod::Password {
            saved.password = connections[index].password.clone();
        }
        connections[index] = saved.clone();
    } else {
        connections.push(saved.clone());
    }
    store_connections(&app, &connections).map_err(|e| e.to_string())?;
    Ok(SavedConnectionView::from(&saved))
}

#[tauri::command]
pub async fn update_saved_connection(
    app: AppHandle,
    id: String,
    name: String,
    request: SshConnectRequest,
    remember_password: bool,
) -> Result<SavedConnectionView, String> {
    let mut connections = load_connections(&app).map_err(|e| e.to_string())?;
    let index = connections
        .iter()
        .position(|connection| connection.id == id)
        .ok_or_else(|| "Bookmark not found".to_string())?;

    let previous = connections[index].clone();
    let identity_changed = previous.host != request.host
        || previous.port != request.port
        || previous.username != request.username;

    let saved = &mut connections[index];
    saved.name = name;
    saved.host = request.host.clone();
    saved.port = request.port;
    saved.username = request.username.clone();
    saved.auth_method = request.auth_method.clone();
    saved.private_key_path = request.private_key_path.clone();

    if identity_changed {
        saved.os_id = None;
        saved.os_name = None;
    }

    match request.auth_method {
        AuthMethod::Password => {
            if remember_password {
                let new_password = request
                    .password
                    .as_ref()
                    .map(|value| value.trim())
                    .filter(|value| !value.is_empty());
                if let Some(password) = new_password {
                    saved.password = Some(password.to_string());
                }
            } else {
                saved.password = None;
            }
        }
        AuthMethod::PrivateKey => {
            saved.password = None;
        }
    }

    store_connections(&app, &connections).map_err(|e| e.to_string())?;
    Ok(SavedConnectionView::from(&connections[index]))
}

#[tauri::command]
pub async fn delete_saved_connection(app: AppHandle, id: String) -> Result<(), String> {
    let mut connections = load_connections(&app).map_err(|e| e.to_string())?;
    connections.retain(|c| c.id != id);
    store_connections(&app, &connections).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn connect_saved(
    app: AppHandle,
    saved_id: String,
    password: Option<String>,
    remember_password: bool,
    cols: u16,
    rows: u16,
    sessions: State<'_, SessionManager>,
) -> Result<SshConnectResult, String> {
    let mut connections = load_connections(&app).map_err(|e| e.to_string())?;
    let index = connections
        .iter()
        .position(|connection| connection.id == saved_id)
        .ok_or_else(|| "Bookmark not found".to_string())?;

    let request = request_from_saved(&connections[index], password.clone());
    let (info, _os_profile) = sessions
        .create_ssh(app.clone(), request.clone(), cols, rows)
        .await
        .map_err(|e| e.to_string())?;

    if remember_password {
        if let Some(password) = password.as_ref() {
            connections[index].password = Some(password.clone());
            store_connections(&app, &connections).map_err(|e| e.to_string())?;
        }
    }

    spawn_ssh_post_connect_tasks(app.clone(), request.clone(), info.id.clone());
    Ok(SshConnectResult {
        session: info,
        os_id: None,
        os_name: None,
    })
}

#[tauri::command]
pub async fn get_device_history(app: AppHandle) -> Result<Vec<DeviceRecord>, String> {
    crate::session::load_device_history(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_device_history(app: AppHandle, id: String) -> Result<(), String> {
    let mut devices = crate::session::load_device_history(&app).map_err(|e| e.to_string())?;
    devices.retain(|device| device.id != id);
    crate::session::store_device_history(&app, &devices).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn connect_device(
    app: AppHandle,
    device: DeviceRecord,
    password: Option<String>,
    cols: u16,
    rows: u16,
    sessions: State<'_, SessionManager>,
) -> Result<SshConnectResult, String> {
    let request = request_from_device(&device, password);
    let (info, _os_profile) = sessions
        .create_ssh(app.clone(), request.clone(), cols, rows)
        .await
        .map_err(|e| e.to_string())?;
    spawn_ssh_post_connect_tasks(app.clone(), request.clone(), info.id.clone());
    Ok(SshConnectResult {
        session: info,
        os_id: None,
        os_name: None,
    })
}

#[tauri::command]
pub fn get_default_download_dir() -> Result<String, String> {
    crate::session::default_download_dir().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn preview_open(
    app: AppHandle,
    request: PreviewOpenRequest,
    sessions: State<'_, SessionManager>,
    previews: State<'_, crate::preview::PreviewManager>,
) -> Result<PreviewOpenResult, String> {
    previews
        .open(&app, &sessions, request)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn preview_close(
    request: PreviewCloseRequest,
    previews: State<'_, crate::preview::PreviewManager>,
) -> Result<(), String> {
    previews.close(&request.handle_id).await;
    Ok(())
}

#[tauri::command]
pub async fn get_path_size(
    request: crate::types::PathSizeRequest,
    sessions: State<'_, SessionManager>,
) -> Result<crate::types::PathSizeResult, String> {
    sessions
        .get_path_size(request)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn probe_path(
    request: ProbePathRequest,
    sessions: State<'_, SessionManager>,
) -> Result<String, String> {
    crate::preview::probe_path(&sessions, &request.session_id, &request.path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_preview_path(
    app: AppHandle,
    path: String,
) -> Result<(), String> {
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn preview_save(
    request: crate::types::PreviewSaveRequest,
    sessions: State<'_, SessionManager>,
    previews: State<'_, crate::preview::PreviewManager>,
) -> Result<crate::types::PreviewOpenResult, String> {
    previews
        .save(&sessions, &request.handle_id, request.content, request.sudo_password)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_preview_handle(
    app: AppHandle,
    request: crate::types::OpenPreviewHandleRequest,
    sessions: State<'_, SessionManager>,
    previews: State<'_, crate::preview::PreviewManager>,
) -> Result<(), String> {
    previews
        .open_in_system(&app, &sessions, &request.handle_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_processes(
    request: ListProcessesRequest,
    sessions: State<'_, SessionManager>,
) -> Result<ProcessListResult, String> {
    sessions
        .list_processes(&request.session_id, request.mode)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_systemd_units(
    request: crate::types::ListSystemdUnitsRequest,
    sessions: State<'_, SessionManager>,
) -> Result<crate::types::SystemdUnitsResult, String> {
    sessions
        .list_systemd_units(&request.session_id)
        .await
        .map(|units| crate::types::SystemdUnitsResult { units })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_passwd_accounts(
    request: crate::types::ListPasswdAccountsRequest,
    sessions: State<'_, SessionManager>,
) -> Result<crate::types::PasswdAccountsResult, String> {
    sessions
        .list_passwd_accounts(&request.session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn complete_path(
    request: crate::types::CompletePathRequest,
    sessions: State<'_, SessionManager>,
) -> Result<crate::types::CompletePathResult, String> {
    sessions
        .complete_path(&request.session_id, &request.partial)
        .await
        .map(|completions| crate::types::CompletePathResult { completions })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kill_process(
    request: KillProcessRequest,
    sessions: State<'_, SessionManager>,
) -> Result<(), String> {
    sessions
        .kill_process(&request.session_id, request.pid, request.force)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn find_files(
    request: FindFilesRequest,
    sessions: State<'_, SessionManager>,
) -> Result<FindFilesResult, String> {
    sessions
        .find_files(request)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_session_cwd(
    request: SessionCwdRequest,
    sessions: State<'_, SessionManager>,
) -> Result<String, String> {
    sessions
        .get_session_cwd(&request.session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_host_stats(
    request: HostStatsRequest,
    sessions: State<'_, SessionManager>,
) -> Result<HostStatsSnapshot, String> {
    sessions
        .get_host_stats(&request.session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ensure_ai_sidecar(
    app: AppHandle,
) -> Result<crate::ai_engineer::SidecarInfo, String> {
    // Heavy first-launch work (venv + pip) must not run as a sync command on the
    // shared blocking path where it starves hydrate/UI invokes → white screen.
    tauri::async_runtime::spawn_blocking(move || {
        crate::ai_engineer::ensure_sidecar(&app).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ai_sidecar_request(
    app: AppHandle,
    request: crate::ai_engineer::SidecarHttpRequest,
) -> Result<crate::ai_engineer::SidecarHttpResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::ai_engineer::sidecar_http(&app, request).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ai_sidecar_stream(
    app: AppHandle,
    session_id: String,
    run_id: String,
    cursor: u32,
    on_event: tauri::ipc::Channel<serde_json::Value>,
) -> Result<(), String> {
    let path = format!(
        "/v1/sessions/{}/stream?cursor={}&run_id={}",
        urlencoding_path(&session_id),
        cursor,
        urlencoding_path(&run_id)
    );
    tauri::async_runtime::spawn_blocking(move || {
        crate::ai_engineer::sidecar_sse_stream(&app, &path, |val| {
            if on_event.send(val).is_err() {
                return Ok(false);
            }
            Ok(true)
        })
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn urlencoding_path(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

#[tauri::command]
pub fn get_ai_settings(app: AppHandle) -> Result<crate::ai_engineer::AiSettingsView, String> {
    crate::ai_engineer::get_ai_settings(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_ai_settings(
    app: AppHandle,
    update: crate::ai_engineer::AiSettingsUpdate,
) -> Result<crate::ai_engineer::AiSettingsView, String> {
    crate::ai_engineer::save_ai_settings(&app, update).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_list_models(
    app: AppHandle,
    request: crate::ai_engineer::AiListModelsRequest,
) -> Result<crate::ai_engineer::AiListModelsResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::ai_engineer::list_ai_models(&app, request).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ai_terminal_exec(
    app: tauri::AppHandle,
    request: crate::ai_engineer::AiTerminalExecRequest,
    sessions: State<'_, SessionManager>,
) -> Result<crate::ai_engineer::AiTerminalExecResult, String> {
    crate::ai_engineer::ai_terminal_exec(request, app, sessions)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_register_privilege_lease(
    request: crate::ai_engineer::RegisterLeaseRequest,
) -> Result<crate::ai_engineer::RegisterLeaseResponse, String> {
    crate::ai_engineer::register_privilege_lease(request).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_local_roots() -> Result<Vec<String>, String> {
    crate::fs_local::list_local_roots().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_local_directory(
    path: Option<String>,
) -> Result<crate::fs_local::ListLocalDirectoryResult, String> {
    crate::fs_local::list_local_directory(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_remote_directory(
    request: crate::fs_remote::ListRemoteDirectoryRequest,
    sessions: State<'_, SessionManager>,
) -> Result<crate::fs_remote::ListRemoteDirectoryResult, String> {
    crate::fs_remote::list_remote_directory(&sessions, request)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_local_path(
    request: crate::fs_local::LocalRenameRequest,
) -> Result<String, String> {
    crate::fs_local::rename_local_path(request).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn move_local_path(request: crate::fs_local::LocalMoveRequest) -> Result<String, String> {
    crate::fs_local::move_local_path(request).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_local_path(request: crate::fs_local::LocalPathRequest) -> Result<(), String> {
    crate::fs_local::delete_local_path(request).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_local_path_size(
    request: crate::fs_local::LocalPathRequest,
) -> Result<crate::fs_local::LocalPathSizeResult, String> {
    crate::fs_local::get_local_path_size(request).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_local_path(app: AppHandle, path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    if p.is_dir() {
        app.opener()
            .open_path(&path, None::<&str>)
            .map_err(|e| e.to_string())
    } else {
        app.opener()
            .open_path(&path, None::<&str>)
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn get_app_version() -> String {
    crate::updater_support::app_version()
}

#[tauri::command]
pub fn get_update_target() -> crate::updater_support::UpdateTargetInfo {
    crate::updater_support::update_target_info()
}

#[tauri::command]
pub fn k8s_discover_contexts() -> Result<Vec<crate::k8s::K8sContextInfo>, String> {
    crate::k8s::discover_contexts().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn k8s_import_kubeconfig(
    path: String,
    display_name: Option<String>,
    #[allow(non_snake_case)]
    displayName: Option<String>,
) -> Result<Vec<crate::k8s::K8sContextInfo>, String> {
    let name = display_name.or(displayName);
    crate::k8s::import_kubeconfig_path(&path, name.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn k8s_import_kubeconfig_yaml(
    yaml: String,
    display_name: Option<String>,
    #[allow(non_snake_case)]
    displayName: Option<String>,
) -> Result<Vec<crate::k8s::K8sContextInfo>, String> {
    let name = display_name.or(displayName);
    crate::k8s::import_kubeconfig_yaml(&yaml, name.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn k8s_rename_imported_kubeconfig(
    path: String,
    display_name: Option<String>,
    #[allow(non_snake_case)]
    displayName: Option<String>,
) -> Result<Vec<crate::k8s::K8sContextInfo>, String> {
    let name = display_name
        .or(displayName)
        .unwrap_or_default();
    crate::k8s::set_imported_display_name(&path, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn k8s_read_kubeconfig(path: String) -> Result<String, String> {
    crate::k8s::read_kubeconfig_yaml(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn k8s_update_kubeconfig(
    path: String,
    display_name: Option<String>,
    #[allow(non_snake_case)]
    displayName: Option<String>,
    yaml: Option<String>,
) -> Result<Vec<crate::k8s::K8sContextInfo>, String> {
    let name = display_name.or(displayName);
    crate::k8s::update_kubeconfig(&path, name.as_deref(), yaml.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn k8s_list_imported_kubeconfigs() -> Vec<String> {
    crate::k8s::list_imported_kubeconfig_paths()
}

#[tauri::command]
pub fn k8s_remove_imported_kubeconfig(path: String) -> Result<(), String> {
    crate::k8s::remove_imported_kubeconfig_path(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn k8s_list_ssh_bindings() -> Vec<crate::k8s::K8sClusterTarget> {
    crate::k8s::list_ssh_bindings()
}

#[tauri::command]
pub async fn k8s_probe_ssh_kubectl(
    sessions: State<'_, SessionManager>,
    session_id: String,
) -> Result<crate::k8s::SshKubectlProbe, String> {
    crate::k8s::probe_ssh_kubectl(&session_id, &sessions)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn k8s_save_ssh_binding(
    binding: crate::k8s::SshBindingInput,
) -> Result<crate::k8s::K8sClusterTarget, String> {
    crate::k8s::save_ssh_binding(binding).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn k8s_delete_ssh_binding(id: String) -> Result<(), String> {
    crate::k8s::delete_ssh_binding(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn k8s_kubectl(
    sessions: State<'_, SessionManager>,
    target: crate::k8s::K8sClusterTarget,
    args: Vec<String>,
) -> Result<crate::k8s::KubectlResult, String> {
    crate::k8s::run_kubectl(&target, &args, &sessions)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn k8s_list_resources(
    sessions: State<'_, SessionManager>,
    target: crate::k8s::K8sClusterTarget,
    category: String,
    namespace: Option<String>,
) -> Result<Vec<crate::k8s::K8sResourceRow>, String> {
    let cat = crate::k8s::resources::ResourceCategory::from_str(&category)
        .ok_or_else(|| format!("unknown category: {category}"))?;
    crate::k8s::list_resources(
        &target,
        cat,
        namespace.as_deref(),
        &sessions,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn k8s_get_resource(
    sessions: State<'_, SessionManager>,
    target: crate::k8s::K8sClusterTarget,
    kind: String,
    namespace: String,
    name: String,
) -> Result<crate::k8s::K8sResourceDetail, String> {
    crate::k8s::get_resource(&target, &kind, &namespace, &name, &sessions)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn k8s_apply_yaml(
    sessions: State<'_, SessionManager>,
    target: crate::k8s::K8sClusterTarget,
    yaml: String,
) -> Result<crate::k8s::KubectlResult, String> {
    crate::k8s::apply_yaml(&target, &yaml, &sessions)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn k8s_delete_resource(
    sessions: State<'_, SessionManager>,
    target: crate::k8s::K8sClusterTarget,
    kind: String,
    namespace: String,
    name: String,
) -> Result<crate::k8s::KubectlResult, String> {
    crate::k8s::delete_resource(&target, &kind, &namespace, &name, &sessions)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn k8s_scale_resource(
    sessions: State<'_, SessionManager>,
    target: crate::k8s::K8sClusterTarget,
    kind: String,
    namespace: String,
    name: String,
    replicas: i32,
) -> Result<crate::k8s::KubectlResult, String> {
    crate::k8s::scale_resource(&target, &kind, &namespace, &name, replicas, &sessions)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn k8s_list_namespaces(
    sessions: State<'_, SessionManager>,
    target: crate::k8s::K8sClusterTarget,
) -> Result<Vec<String>, String> {
    crate::k8s::list_namespaces(&target, &sessions)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn k8s_pod_logs(
    sessions: State<'_, SessionManager>,
    target: crate::k8s::K8sClusterTarget,
    namespace: String,
    pod: String,
    container: Option<String>,
    tail_lines: Option<u32>,
) -> Result<String, String> {
    crate::k8s::pod_logs(
        &target,
        &namespace,
        &pod,
        container.as_deref(),
        tail_lines.unwrap_or(200),
        &sessions,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn k8s_pod_shell_command(
    target: crate::k8s::K8sClusterTarget,
    namespace: String,
    pod: String,
    container: Option<String>,
) -> Result<String, String> {
    Ok(crate::k8s::pod_shell_command(
        &target,
        &namespace,
        &pod,
        container.as_deref(),
    ))
}

#[tauri::command]
pub fn k8s_open_pod_shell_local(
    target: crate::k8s::K8sClusterTarget,
    namespace: String,
    pod: String,
    container: Option<String>,
) -> Result<(), String> {
    let cmd = crate::k8s::pod_shell_command(
        &target,
        &namespace,
        &pod,
        container.as_deref(),
    );
    crate::k8s::open_local_terminal_command(&cmd).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn k8s_pod_containers(
    sessions: State<'_, SessionManager>,
    target: crate::k8s::K8sClusterTarget,
    namespace: String,
    pod: String,
) -> Result<Vec<String>, String> {
    crate::k8s::pod_containers(&target, &namespace, &pod, &sessions)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn k8s_port_forward_start(
    sessions: State<'_, SessionManager>,
    target: crate::k8s::K8sClusterTarget,
    resource_kind: String,
    namespace: String,
    name: String,
    local_port: u16,
    remote_port: u16,
) -> Result<crate::k8s::PortForwardInfo, String> {
    crate::k8s::start_port_forward(
        &target,
        &resource_kind,
        &namespace,
        &name,
        local_port,
        remote_port,
        &sessions,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn k8s_port_forward_stop(
    sessions: State<'_, SessionManager>,
    id: String,
) -> Result<(), String> {
    crate::k8s::stop_port_forward(&id, &sessions)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn k8s_port_forward_list() -> Result<Vec<crate::k8s::PortForwardInfo>, String> {
    Ok(crate::k8s::list_port_forwards())
}

#[tauri::command]
pub async fn k8s_helm_list_releases(
    sessions: State<'_, SessionManager>,
    target: crate::k8s::K8sClusterTarget,
    namespace: Option<String>,
) -> Result<Vec<crate::k8s::HelmReleaseRow>, String> {
    crate::k8s::list_helm_releases(&target, namespace.as_deref(), &sessions)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn k8s_helm_get_values(
    sessions: State<'_, SessionManager>,
    target: crate::k8s::K8sClusterTarget,
    namespace: String,
    name: String,
) -> Result<String, String> {
    crate::k8s::helm_release_values(&target, &namespace, &name, &sessions)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn k8s_list_crd_instances(
    sessions: State<'_, SessionManager>,
    target: crate::k8s::K8sClusterTarget,
    plural: String,
    namespace: Option<String>,
) -> Result<Vec<crate::k8s::K8sResourceRow>, String> {
    crate::k8s::list_crd_instances(&target, &plural, namespace.as_deref(), &sessions)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn k8s_tools_status() -> Result<crate::k8s::K8sToolsStatus, String> {
    crate::k8s::tools_status_checked()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn k8s_tools_install(
    tool: crate::k8s::K8sToolKind,
) -> Result<crate::k8s::K8sToolsStatus, String> {
    crate::k8s::install_tools(tool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn k8s_cluster_summary(
    sessions: State<'_, SessionManager>,
    target: crate::k8s::K8sClusterTarget,
) -> Result<crate::k8s::K8sClusterSummary, String> {
    crate::k8s::cluster_summary(&target, &sessions)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn k8s_top_pods(
    sessions: State<'_, SessionManager>,
    target: crate::k8s::K8sClusterTarget,
    namespace: Option<String>,
) -> Result<Vec<crate::k8s::K8sTopPodRow>, String> {
    crate::k8s::top_pods(&target, namespace.as_deref(), &sessions)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn k8s_kubectl_shell_command(
    target: crate::k8s::K8sClusterTarget,
) -> Result<String, String> {
    Ok(crate::k8s::kubectl_shell_command(&target))
}

#[tauri::command]
pub fn k8s_open_kubectl_terminal(
    target: crate::k8s::K8sClusterTarget,
) -> Result<(), String> {
    let cmd = crate::k8s::kubectl_shell_command(&target);
    crate::k8s::open_local_terminal_command(&cmd).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn k8s_pod_shell_start(
    app: tauri::AppHandle,
    target: crate::k8s::K8sClusterTarget,
    namespace: String,
    pod: String,
    container: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<crate::k8s::K8sPodShellInfo, String> {
    crate::k8s::start_pod_shell(
        app,
        &target,
        &namespace,
        &pod,
        container.as_deref(),
        cols.unwrap_or(120),
        rows.unwrap_or(32),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn k8s_pod_shell_input(id: String, data: String) -> Result<(), String> {
    crate::k8s::pod_shell_input(&id, &data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn k8s_pod_shell_resize(id: String, cols: u16, rows: u16) -> Result<(), String> {
    crate::k8s::pod_shell_resize(&id, cols, rows).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn k8s_pod_shell_stop(id: String) -> Result<(), String> {
    crate::k8s::stop_pod_shell(&id).map_err(|e| e.to_string())
}

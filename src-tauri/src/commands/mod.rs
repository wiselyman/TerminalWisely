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
    FsMoveRequest, FsPathRequest, FsRenameRequest, FsCreateRequest, FsCopyRequest,
    HostStatsRequest, HostStatsSnapshot,
    ProcessListResult, SavedConnectionView, SessionCwdRequest, SessionInfo, SessionMetadataUpdated,
    SshConnectRequest, SshConnectResult,
    PreviewReadBytesRequest, PreviewReadBytesResult, PreviewWriteBytesRequest,
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
pub async fn set_ai_ssh_lease(
    session_id: String,
    active: bool,
    sessions: State<'_, SessionManager>,
) -> Result<(), String> {
    sessions.set_ai_ssh_lease(&session_id, active).await;
    Ok(())
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
pub async fn create_path(
    request: FsCreateRequest,
    sessions: State<'_, SessionManager>,
) -> Result<(), String> {
    sessions
        .create_path(
            &request.session_id,
            &request.parent_dir,
            &request.name,
            &request.kind,
            request.sudo_password.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn copy_path(
    request: FsCopyRequest,
    sessions: State<'_, SessionManager>,
) -> Result<(), String> {
    sessions
        .copy_path(
            &request.session_id,
            &request.path,
            &request.dest_dir,
            request.sudo_password.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn duplicate_path(
    request: FsPathRequest,
    sessions: State<'_, SessionManager>,
) -> Result<(), String> {
    sessions
        .duplicate_path(
            &request.session_id,
            &request.path,
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
pub fn take_catalog_restore_notice(app: AppHandle) -> Vec<String> {
    crate::durable::take_notice(&crate::durable::app_roots(&app))
}

#[tauri::command]
pub fn save_entity_layout(
    app: AppHandle,
    scope: String,
    layout: serde_json::Value,
    allow_empty: bool,
) -> Result<(), String> {
    if !crate::durable::is_entity_layout_scope(&scope) {
        return Err("unknown layout scope".into());
    }
    let roots = crate::durable::app_roots(&app);
    let mut document = crate::durable::load_value(&roots, "entity-layout.json")?;
    if !document.is_object() {
        document = serde_json::json!({});
    }
    document[scope] = layout;
    let mode = if allow_empty {
        crate::durable::WriteMode::AllowEmpty
    } else {
        crate::durable::WriteMode::KeepRecords
    };
    crate::durable::save_value(&roots, "entity-layout.json", &document, mode)
}

#[tauri::command]
pub fn load_entity_layout(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::durable::load_value(&crate::durable::app_roots(&app), "entity-layout.json")
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
    store_connections(&app, &connections, crate::durable::WriteMode::KeepRecords)
        .map_err(|e| e.to_string())?;
    Ok(SavedConnectionView::from(&saved))
}

#[tauri::command]
pub async fn reorder_saved_connections(
    app: AppHandle,
    ids: Vec<String>,
) -> Result<(), String> {
    let mut connections = load_connections(&app).map_err(|e| e.to_string())?;
    let mut reordered = Vec::with_capacity(connections.len());
    for id in &ids {
        if let Some(index) = connections.iter().position(|c| &c.id == id) {
            reordered.push(connections.remove(index));
        }
    }
    reordered.extend(connections);
    store_connections(&app, &reordered, crate::durable::WriteMode::KeepRecords)
        .map_err(|e| e.to_string())?;
    Ok(())
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
                if let Some(password) = request.password.clone().filter(|value| !value.is_empty()) {
                    saved.password = Some(password);
                }
            } else {
                saved.password = None;
            }
        }
        AuthMethod::PrivateKey => {
            saved.password = None;
        }
    }

    store_connections(&app, &connections, crate::durable::WriteMode::KeepRecords)
        .map_err(|e| e.to_string())?;
    Ok(SavedConnectionView::from(&connections[index]))
}

#[tauri::command]
pub async fn delete_saved_connection(app: AppHandle, id: String) -> Result<(), String> {
    let mut connections = load_connections(&app).map_err(|e| e.to_string())?;
    connections.retain(|c| c.id != id);
    store_connections(&app, &connections, crate::durable::WriteMode::AllowEmpty)
        .map_err(|e| e.to_string())?;
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
            store_connections(&app, &connections, crate::durable::WriteMode::KeepRecords)
                .map_err(|e| e.to_string())?;
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
    crate::session::store_device_history(&app, &devices, crate::durable::WriteMode::AllowEmpty)
        .map_err(|e| e.to_string())
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
pub async fn preview_read_bytes(
    request: PreviewReadBytesRequest,
    sessions: State<'_, SessionManager>,
) -> Result<PreviewReadBytesResult, String> {
    crate::preview::read_preview_bytes(&sessions, &request.session_id, &request.path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn preview_write_bytes(
    request: PreviewWriteBytesRequest,
    sessions: State<'_, SessionManager>,
) -> Result<(), String> {
    crate::preview::write_preview_bytes(
        &sessions,
        &request.session_id,
        &request.path,
        &request.base64,
        request.sudo_password.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_ensure(
    app: AppHandle,
    request: crate::browser::BrowserEnsureRequest,
    sessions: State<'_, SessionManager>,
    browsers: State<'_, crate::browser::BrowserManager>,
) -> Result<crate::browser::BrowserEnsureResult, String> {
    browsers
        .ensure_tab(
            &app,
            &sessions,
            &request.session_id,
            request.tab_id.as_deref().unwrap_or("default"),
            request.bounds(),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_local_ensure(
    app: AppHandle,
    request: crate::browser::BrowserLocalRequest,
    browsers: State<'_, crate::browser::BrowserManager>,
) -> Result<crate::browser::BrowserLocalEnsureResult, String> {
    browsers
        .ensure_local_tab(&app, &request.tab_id, request.bounds())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_local_activate_tab(
    app: AppHandle,
    request: crate::browser::BrowserLocalRequest,
    browsers: State<'_, crate::browser::BrowserManager>,
) -> Result<crate::browser::BrowserLocalEnsureResult, String> {
    browsers
        .activate_local_tab(&app, &request.tab_id, request.bounds())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_local_navigate(
    app: AppHandle,
    request: crate::browser::BrowserLocalRequest,
    browsers: State<'_, crate::browser::BrowserManager>,
) -> Result<crate::browser::BrowserLocalEnsureResult, String> {
    let url = request.url.as_deref().ok_or("URL is required")?;
    browsers
        .navigate_local(&app, &request.tab_id, url, request.bounds())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn browser_local_close_tab(
    app: AppHandle,
    request: crate::browser::BrowserLocalRequest,
    browsers: State<'_, crate::browser::BrowserManager>,
) {
    browsers.close_local_tab(&app, &request.tab_id);
}

#[tauri::command]
pub async fn browser_navigate(
    app: AppHandle,
    request: crate::browser::BrowserNavigateRequest,
    sessions: State<'_, SessionManager>,
    browsers: State<'_, crate::browser::BrowserManager>,
) -> Result<(), String> {
    browsers
        .navigate(
            &app,
            &sessions,
            &request.session_id,
            request.tab_id.as_deref().unwrap_or("default"),
            &request.url,
            request.bounds(),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_activate_tab(
    app: AppHandle,
    request: crate::browser::BrowserTabRequest,
    browsers: State<'_, crate::browser::BrowserManager>,
) -> Result<crate::browser::BrowserEnsureResult, String> {
    browsers
        .activate_tab(
            &app,
            &request.session_id,
            &request.tab_id,
            request.bounds(),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_close_tab(
    app: AppHandle,
    request: crate::browser::BrowserTabRequest,
    browsers: State<'_, crate::browser::BrowserManager>,
) -> Result<(), String> {
    browsers
        .close_tab(&app, &request.session_id, &request.tab_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_hide_session(
    app: AppHandle,
    request: crate::browser::BrowserShutdownRequest,
    browsers: State<'_, crate::browser::BrowserManager>,
) -> Result<(), String> {
    browsers
        .hide_session(&app, &request.session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_shutdown(
    app: AppHandle,
    request: crate::browser::BrowserShutdownRequest,
    browsers: State<'_, crate::browser::BrowserManager>,
) -> Result<(), String> {
    browsers
        .shutdown_session(&app, &request.session_id)
        .await;
    Ok(())
}

#[tauri::command]
pub async fn browser_set_webview_bounds(
    app: AppHandle,
    request: crate::browser::BrowserBoundsRequest,
    browsers: State<'_, crate::browser::BrowserManager>,
) -> Result<(), String> {
    browsers
        .set_bounds(
            &app,
            &request.webview_label,
            request.x,
            request.y,
            request.width,
            request.height,
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_set_visible(
    app: AppHandle,
    request: crate::browser::BrowserVisibleRequest,
    browsers: State<'_, crate::browser::BrowserManager>,
) -> Result<(), String> {
    browsers
        .set_visible(&app, &request.webview_label, request.visible)
        .await
        .map_err(|e| e.to_string())
}

/// Hide every host-browser child surface (host tab switch / shell restore).
#[tauri::command]
pub fn browser_hide_all(app: AppHandle) {
    crate::browser::hide_all_browser_surfaces(&app);
}

#[tauri::command]
pub async fn browser_back(
    app: AppHandle,
    request: crate::browser::BrowserWebviewLabelRequest,
    browsers: State<'_, crate::browser::BrowserManager>,
) -> Result<(), String> {
    browsers
        .go_back(&app, &request.webview_label)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_forward(
    app: AppHandle,
    request: crate::browser::BrowserWebviewLabelRequest,
    browsers: State<'_, crate::browser::BrowserManager>,
) -> Result<(), String> {
    browsers
        .go_forward(&app, &request.webview_label)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_reload(
    app: AppHandle,
    request: crate::browser::BrowserWebviewLabelRequest,
    browsers: State<'_, crate::browser::BrowserManager>,
) -> Result<(), String> {
    browsers
        .reload(&app, &request.webview_label)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct BrowserHistoryListRequest {
    pub profile_key: Option<String>,
}

#[tauri::command]
pub fn browser_history_list(
    app: AppHandle,
    request: BrowserHistoryListRequest,
) -> Result<Vec<crate::browser::BrowserHistoryEntry>, String> {
    crate::browser::history_list(&app, request.profile_key.as_deref()).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct BrowserHistoryRecordRequest {
    pub profile_key: String,
    pub url: String,
    pub title: String,
}

#[tauri::command]
pub fn browser_history_record(
    app: AppHandle,
    request: BrowserHistoryRecordRequest,
) -> Result<(), String> {
    crate::browser::history_record(
        &app,
        &request.profile_key,
        &request.url,
        &request.title,
    )
    .map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct BrowserHistoryClearRequest {
    pub profile_key: Option<String>,
}

#[tauri::command]
pub fn browser_history_clear(
    app: AppHandle,
    request: BrowserHistoryClearRequest,
) -> Result<(), String> {
    crate::browser::history_clear(&app, request.profile_key.as_deref()).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct BrowserBookmarksListRequest {
    pub profile_key: Option<String>,
}

#[tauri::command]
pub fn browser_bookmarks_list(
    app: AppHandle,
    request: BrowserBookmarksListRequest,
) -> Result<Vec<crate::browser::BrowserBookmark>, String> {
    crate::browser::bookmarks_list(&app, request.profile_key.as_deref()).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct BrowserBookmarkUpsertRequest {
    pub profile_key: String,
    pub url: String,
    pub title: String,
}

#[tauri::command]
pub fn browser_bookmark_upsert(
    app: AppHandle,
    request: BrowserBookmarkUpsertRequest,
) -> Result<crate::browser::BrowserBookmark, String> {
    crate::browser::bookmark_upsert(
        &app,
        &request.profile_key,
        &request.url,
        &request.title,
    )
    .map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct BrowserBookmarkRemoveRequest {
    pub id: String,
}

#[tauri::command]
pub fn browser_bookmark_remove(
    app: AppHandle,
    request: BrowserBookmarkRemoveRequest,
) -> Result<(), String> {
    crate::browser::bookmark_remove(&app, &request.id).map_err(|e| e.to_string())
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
pub fn list_local_processes() -> Result<ProcessListResult, String> {
    crate::process::list_local_processes().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kill_local_process(pid: u32, force: bool) -> Result<(), String> {
    crate::process::kill_local_process(pid, force).map_err(|e| e.to_string())
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
pub async fn ai_local_exec(
    request: crate::local_exec::AiLocalExecRequest,
) -> Result<crate::local_exec::AiLocalExecResult, String> {
    tauri::async_runtime::spawn_blocking(move || crate::local_exec::run_local_exec(request))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn local_terminal_start(
    app: AppHandle,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    crate::local_terminal::start(app, cols, rows).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn local_terminal_input(id: String, data: String) -> Result<(), String> {
    crate::local_terminal::input(&id, &data).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn local_terminal_resize(id: String, cols: u16, rows: u16) -> Result<(), String> {
    crate::local_terminal::resize(&id, cols, rows).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn local_terminal_stop(id: String) {
    crate::local_terminal::stop(&id);
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
pub async fn ai_chat_cache_remote_media(
    app: tauri::AppHandle,
    url: String,
) -> Result<crate::ai_engineer::CachedRemoteMedia, String> {
    crate::ai_engineer::cache_remote_media(&app, &url)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_chat_resolve_media(
    app: tauri::AppHandle,
    media_id: String,
) -> Result<crate::ai_engineer::CachedRemoteMedia, String> {
    crate::ai_engineer::resolve_media_id(&app, &media_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_chat_history_load(
    app: tauri::AppHandle,
) -> Result<crate::ai_engineer::ChatHistorySnapshot, String> {
    // Index only (no message bodies) — full bodies via ai_chat_history_load_scope.
    crate::ai_engineer::load_chat_history_index(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_chat_history_load_scope(
    app: tauri::AppHandle,
    scope: String,
) -> Result<Option<crate::ai_engineer::ScopeThreadBundle>, String> {
    crate::ai_engineer::load_chat_scope(&app, &scope).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_chat_history_save_scope(
    app: tauri::AppHandle,
    scope: String,
    bundle: crate::ai_engineer::ScopeThreadBundle,
) -> Result<(), String> {
    crate::ai_engineer::save_scope_bundle(&app, scope, bundle).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_chat_history_save_all(
    app: tauri::AppHandle,
    by_scope: std::collections::HashMap<String, crate::ai_engineer::ScopeThreadBundle>,
) -> Result<(), String> {
    crate::ai_engineer::save_all_scopes(&app, by_scope).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_chat_history_import_localstorage(
    app: tauri::AppHandle,
    by_scope: std::collections::HashMap<String, crate::ai_engineer::ScopeThreadBundle>,
    force: Option<bool>,
) -> Result<crate::ai_engineer::ChatHistorySnapshot, String> {
    crate::ai_engineer::import_localstorage_snapshot(&app, by_scope, force.unwrap_or(false))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_chat_history_mark_migrated(app: tauri::AppHandle) -> Result<(), String> {
    crate::ai_engineer::mark_migrated(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_local_roots() -> Result<Vec<String>, String> {
    crate::fs_local::list_local_roots().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_local_directory(
    path: Option<String>,
    show_hidden: Option<bool>,
) -> Result<crate::fs_local::ListLocalDirectoryResult, String> {
    crate::fs_local::list_local_directory(path, show_hidden.unwrap_or(false)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_local_path(request: crate::fs_local::LocalCreateRequest) -> Result<String, String> {
    crate::fs_local::create_local_path(request).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_local_text(request: crate::fs_local::LocalPathRequest) -> Result<String, String> {
    crate::fs_local::read_local_text(request).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_local_bytes(request: crate::fs_local::LocalPathRequest) -> Result<Vec<u8>, String> {
    crate::fs_local::read_local_bytes(request).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_local_text(request: crate::fs_local::LocalTextWriteRequest) -> Result<(), String> {
    crate::fs_local::write_local_text(request).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_local_bytes(request: crate::fs_local::LocalBytesWriteRequest) -> Result<(), String> {
    crate::fs_local::write_local_bytes(request).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_local_bytes_as(request: crate::fs_local::LocalBytesWriteRequest) -> Result<(), String> {
    crate::fs_local::save_local_bytes_as(request).map_err(|e| e.to_string())
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

/// Reveal a local file in the OS file manager, or open a directory.
#[tauri::command]
pub async fn reveal_local_path(app: AppHandle, path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("Path not found: {path}"));
    }
    if p.is_dir() {
        app.opener()
            .open_path(&path, None::<&str>)
            .map_err(|e| e.to_string())
    } else {
        app.opener()
            .reveal_item_in_dir(&path)
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn get_app_version() -> String {
    crate::updater_support::app_version()
}

#[tauri::command]
pub fn markdown_pandoc_path() -> Option<String> {
    crate::markdown_conversion::find_pandoc().map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn markdown_pandoc_formats() -> Vec<String> {
    crate::markdown_conversion::list_formats()
}

#[tauri::command]
pub fn markdown_pandoc_input_formats() -> Vec<String> {
    crate::markdown_conversion::list_input_formats()
}

#[tauri::command]
pub fn markdown_pandoc_convert(request_id: String, from: String, to: String, input: String) -> Result<String, String> {
    crate::markdown_conversion::convert(&request_id, &from, &to, &input)
}

#[tauri::command]
pub fn markdown_pandoc_cancel(request_id: String) -> bool {
    crate::markdown_conversion::cancel_conversion(&request_id)
}

#[tauri::command]
pub fn markdown_pandoc_import_file(request_id: String, from: String, path: String) -> Result<String, String> {
    crate::markdown_conversion::import_file(&request_id, &from, std::path::Path::new(&path))
}

#[tauri::command]
pub fn get_update_target() -> crate::updater_support::UpdateTargetInfo {
    crate::updater_support::update_target_info()
}

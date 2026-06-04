use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::session::{
    load_connections, record_device_history, request_from_device, request_from_saved,
    saved_connection_from_request, store_connections, SessionManager,
};
use crate::ssh::client::{emit_transfer_complete, insert_local_paths};
use crate::types::{
    AuthMethod, DeviceRecord, DownloadFileRequest, EnterDirectoryRequest,
    InsertLocalPathsRequest, SavedConnectionView,
    SessionInfo, SshConnectRequest, UploadFileResult, UploadFilesRequest,
};

#[tauri::command]
pub async fn create_local_session(
    app: AppHandle,
    cols: u16,
    rows: u16,
    sessions: State<'_, SessionManager>,
) -> Result<SessionInfo, String> {
    sessions
        .create_local(app, cols, rows)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_ssh_session(
    app: AppHandle,
    request: SshConnectRequest,
    cols: u16,
    rows: u16,
    sessions: State<'_, SessionManager>,
) -> Result<SessionInfo, String> {
    let info = sessions
        .create_ssh(app.clone(), request.clone(), cols, rows)
        .await
        .map_err(|e| e.to_string())?;
    record_device_history(&app, &request).map_err(|e| e.to_string())?;
    Ok(info)
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
pub async fn close_session(
    session_id: String,
    sessions: State<'_, SessionManager>,
) -> Result<(), String> {
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
    let results = sessions
        .upload_files(app.clone(), request)
        .await
        .map_err(|e| e.to_string())?;

    let filenames: Vec<String> = results.iter().map(|r| r.filename.clone()).collect();
    let message = if results.len() == 1 {
        format!("已上传: {}", results[0].filename)
    } else {
        format!("已上传 {} 个文件", results.len())
    };

    emit_transfer_complete(
        &app,
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
    let local_path = sessions
        .download_file(app.clone(), request)
        .await
        .map_err(|e| e.to_string())?;

    if let Err(err) = app.opener().reveal_item_in_dir(&local_path) {
        log::warn!("Failed to reveal download folder: {err}");
    }

    let file_name = std::path::Path::new(&local_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");

    emit_transfer_complete(
        &app,
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
pub async fn insert_local_paths_command(
    request: InsertLocalPathsRequest,
    sessions: State<'_, SessionManager>,
) -> Result<String, String> {
    insert_local_paths(&sessions, request)
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
) -> Result<SavedConnectionView, String> {
    let mut connections = load_connections(&app).map_err(|e| e.to_string())?;
    let mut saved = saved_connection_from_request(&name, &request);
    if remember_password && request.auth_method == AuthMethod::Password {
        saved.password = request.password.clone();
    }
    connections.push(saved.clone());
    store_connections(&app, &connections).map_err(|e| e.to_string())?;
    Ok(SavedConnectionView::from(&saved))
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
) -> Result<SessionInfo, String> {
    let mut connections = load_connections(&app).map_err(|e| e.to_string())?;
    let index = connections
        .iter()
        .position(|connection| connection.id == saved_id)
        .ok_or_else(|| "Bookmark not found".to_string())?;

    let request = request_from_saved(&connections[index], password.clone());
    let info = sessions
        .create_ssh(app.clone(), request.clone(), cols, rows)
        .await
        .map_err(|e| e.to_string())?;

    if remember_password {
        if let Some(password) = password.as_ref() {
            connections[index].password = Some(password.clone());
            store_connections(&app, &connections).map_err(|e| e.to_string())?;
        }
    }

    record_device_history(&app, &request).map_err(|e| e.to_string())?;
    Ok(info)
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
) -> Result<SessionInfo, String> {
    let request = request_from_device(&device, password);
    let info = sessions
        .create_ssh(app.clone(), request.clone(), cols, rows)
        .await
        .map_err(|e| e.to_string())?;
    record_device_history(&app, &request).map_err(|e| e.to_string())?;
    Ok(info)
}

#[tauri::command]
pub fn get_default_download_dir() -> Result<String, String> {
    crate::session::default_download_dir().map_err(|e| e.to_string())
}

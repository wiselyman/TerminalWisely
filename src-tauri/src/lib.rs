mod host;
mod host_stats;
mod local_shell;
#[cfg(windows)]
mod msys;
mod find;
mod commands;
mod error;
mod preview;
mod preview_sudo;
mod process;
mod pty;
mod session;
mod shell;
mod ssh;
mod transfer;
mod types;

use session::SessionManager;
use tauri::image::Image;
use tauri::Manager;

#[cfg(target_os = "linux")]
fn apply_linux_webkit_workarounds() {
    // Blank window on some Linux GPU stacks (NVIDIA, ARM Mali, etc.).
    // Must be set before WebKitGTK initializes. See tauri-apps/tauri#9394.
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}

fn apply_window_icon(app: &tauri::App) -> tauri::Result<()> {
    let icon_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("icons/32x32.png");
    if !icon_path.exists() {
        return Ok(());
    }

    let icon = Image::from_path(&icon_path)?.to_owned();
    for (_, window) in app.webview_windows() {
        window.set_icon(icon.clone())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    #[cfg(target_os = "linux")]
    apply_linux_webkit_workarounds();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(SessionManager::new())
        .manage(preview::PreviewManager::new())
        .setup(|app| {
            apply_window_icon(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_local_session,
            commands::get_local_shell_info,
            commands::create_ssh_session,
            commands::terminal_input,
            commands::resize_terminal,
            commands::reconnect_ssh_session,
            commands::close_session,
            commands::list_sessions,
            commands::upload_files,
            commands::download_file,
            commands::cancel_transfer,
            commands::probe_remote_path,
            commands::transfer_remote_file,
            commands::enter_directory,
            commands::insert_local_paths_command,
            commands::get_saved_connections,
            commands::save_connection,
            commands::update_saved_connection,
            commands::delete_saved_connection,
            commands::connect_saved,
            commands::get_device_history,
            commands::remove_device_history,
            commands::connect_device,
            commands::get_default_download_dir,
            commands::preview_open,
            commands::preview_close,
            commands::preview_save,
            commands::probe_path,
            commands::open_preview_path,
            commands::open_preview_handle,
            commands::list_processes,
            commands::kill_process,
            commands::find_files,
            commands::get_session_cwd,
            commands::get_host_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

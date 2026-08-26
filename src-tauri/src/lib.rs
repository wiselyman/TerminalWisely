mod host;
mod host_stats;
mod find;
mod ai_engineer;
mod commands;
mod error;
mod fs_archive;
mod fs_local;
mod fs_remote;
mod path_complete;
mod path_size;
mod passwd;
mod preview;
mod preview_sudo;
mod process;
mod session;
mod shell;
mod systemd;
mod ssh;
mod transfer;
mod types;
mod updater_support;
mod app_menu;

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

#[cfg(target_os = "macos")]
fn apply_macos_window_effects(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    use std::time::Duration;
    use tauri::window::{Effect, EffectState, EffectsBuilder};

    window.set_effects(
        EffectsBuilder::new()
            .effect(Effect::HudWindow)
            .state(EffectState::Active)
            .radius(10.0)
            .build(),
    )?;

    // set_effects / Overlay only grows the titlebar chrome; it does not move the
    // buttons down. Re-apply after effects settle so lights center in our 38px bar.
    const X: f64 = 14.0;
    const TITLEBAR_HEIGHT: f64 = 38.0;
    inset_macos_traffic_lights(window, X, TITLEBAR_HEIGHT);

    let delayed = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(120));
        let window_for_inset = delayed.clone();
        let _ = delayed.run_on_main_thread(move || {
            inset_macos_traffic_lights(&window_for_inset, X, TITLEBAR_HEIGHT);
        });
    });

    Ok(())
}

/// Vertically center native traffic lights in a titlebar of `titlebar_height`.
/// Cocoa y grows upward; button `origin.y` is from the bottom of the titlebar view.
#[cfg(target_os = "macos")]
fn inset_macos_traffic_lights(window: &tauri::WebviewWindow, x: f64, titlebar_height: f64) {
    use objc2_app_kit::{NSWindow, NSWindowButton};
    use objc2_foundation::NSPoint;

    let Ok(ns_window_ptr) = window.ns_window() else {
        return;
    };
    if ns_window_ptr.is_null() {
        return;
    }

    // SAFETY: pointer from Tauri macOS private API for this live window.
    unsafe {
        let ns_window = &*(ns_window_ptr as *const NSWindow);
        let Some(close) = ns_window.standardWindowButton(NSWindowButton::CloseButton) else {
            return;
        };
        let Some(miniaturize) =
            ns_window.standardWindowButton(NSWindowButton::MiniaturizeButton)
        else {
            return;
        };
        let Some(zoom) = ns_window.standardWindowButton(NSWindowButton::ZoomButton) else {
            return;
        };

        let Some(button_superview) = close.superview() else {
            return;
        };
        let Some(title_bar_container) = button_superview.superview() else {
            return;
        };

        let close_rect = close.frame();
        let button_height = close_rect.size.height;
        let mut title_bar_rect = title_bar_container.frame();
        title_bar_rect.size.height = titlebar_height;
        title_bar_rect.origin.y = ns_window.frame().size.height - titlebar_height;
        title_bar_container.setFrame(title_bar_rect);

        let space_between = miniaturize.frame().origin.x - close_rect.origin.x;
        let origin_y = ((titlebar_height - button_height) / 2.0).max(0.0);

        for (index, button) in [close, miniaturize, zoom].into_iter().enumerate() {
            button.setFrameOrigin(NSPoint {
                x: x + (index as f64 * space_between),
                y: origin_y,
            });
        }
    }
}

fn fit_window_to_monitor(window: &tauri::WebviewWindow) {
    const PREFERRED_W: f64 = 1400.0;
    const PREFERRED_H: f64 = 860.0;

    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());

    let Some(monitor) = monitor else {
        let _ = window.set_size(tauri::LogicalSize::new(PREFERRED_W, PREFERRED_H));
        let _ = window.center();
        return;
    };

    let scale = monitor.scale_factor();
    let work = monitor.work_area();
    // Logical work-area size (excludes menu bar / dock).
    let work_w = (work.size.width as f64 / scale).max(800.0);
    let work_h = (work.size.height as f64 / scale).max(500.0);
    let target_w = PREFERRED_W.min(work_w * 0.96).max(800.0);
    let target_h = PREFERRED_H.min(work_h * 0.96).max(500.0);

    let _ = window.set_size(tauri::LogicalSize::new(target_w, target_h));
    center_window_on_work_area(window, &monitor);
}

fn center_window_on_work_area(window: &tauri::WebviewWindow, monitor: &tauri::Monitor) {
    let Ok(outer) = window.outer_size() else {
        let _ = window.center();
        return;
    };
    let work = monitor.work_area();
    let x = work.position.x + (work.size.width as i32 - outer.width as i32) / 2;
    let y = work.position.y + (work.size.height as i32 - outer.height as i32) / 2;
    let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    #[cfg(target_os = "linux")]
    apply_linux_webkit_workarounds();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(SessionManager::new())
        .manage(preview::PreviewManager::new())
        .setup(|app| {
            apply_window_icon(app)?;
            app_menu::install(app)?;
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                apply_macos_window_effects(&window)?;
                fit_window_to_monitor(&window);
                // macOS effects / undecorated chrome can shift position; re-center after settle.
                #[cfg(target_os = "macos")]
                {
                    let delayed = window.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(160));
                        let window_for_center = delayed.clone();
                        let _ = delayed.run_on_main_thread(move || {
                            fit_window_to_monitor(&window_for_center);
                        });
                    });
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if window.label() == "main" {
                    ai_engineer::stop_sidecar();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_ssh_session,
            commands::terminal_input,
            commands::resize_terminal,
            commands::reconnect_ssh_session,
            commands::close_session,
            commands::list_sessions,
            commands::upload_files,
            commands::download_file,
            commands::download_directory,
            commands::cancel_transfer,
            commands::probe_remote_path,
            commands::transfer_remote_file,
            commands::enter_directory,
            commands::rename_path,
            commands::delete_path,
            commands::move_path,
            commands::compress_path,
            commands::extract_archive,
            commands::insert_local_paths_command,
            commands::insert_terminal_command,
            commands::get_saved_connections,
            commands::save_connection,
            commands::update_saved_connection,
            commands::delete_saved_connection,
            commands::connect_saved,
            commands::get_device_history,
            commands::remove_device_history,
            commands::connect_device,
            commands::get_default_download_dir,
            commands::list_local_roots,
            commands::list_local_directory,
            commands::list_remote_directory,
            commands::rename_local_path,
            commands::move_local_path,
            commands::delete_local_path,
            commands::get_local_path_size,
            commands::open_local_path,
            commands::preview_open,
            commands::preview_close,
            commands::preview_save,
            commands::probe_path,
            commands::get_path_size,
            commands::open_preview_path,
            commands::open_preview_handle,
            commands::list_processes,
            commands::list_systemd_units,
            commands::list_passwd_accounts,
            commands::complete_path,
            commands::kill_process,
            commands::find_files,
            commands::get_session_cwd,
            commands::get_host_stats,
            commands::ensure_ai_sidecar,
            commands::ai_sidecar_request,
            commands::ai_sidecar_stream,
            commands::get_ai_settings,
            commands::save_ai_settings,
            commands::ai_list_models,
            commands::ai_terminal_exec,
            commands::ai_register_privilege_lease,
            commands::get_app_version,
            commands::get_update_target,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                ai_engineer::stop_sidecar();
            }
        });
}

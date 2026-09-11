//! Native application menu: Check for Updates (+ Settings on all platforms).

use tauri::{
    image::Image,
    menu::{
        AboutMetadataBuilder, MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder,
    },
    App, Emitter, Manager,
};

pub const MENU_CHECK_UPDATES: &str = "tw_check_for_updates";
pub const MENU_SETTINGS: &str = "tw_open_settings";
pub const EVENT_CHECK_UPDATES: &str = "tw://menu-check-for-updates";
pub const EVENT_OPEN_SETTINGS: &str = "tw://menu-open-settings";

pub fn install(app: &App) -> tauri::Result<()> {
    let check = MenuItem::with_id(
        app,
        MENU_CHECK_UPDATES,
        "Check for Updates…",
        true,
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(
        app,
        MENU_SETTINGS,
        "Settings…",
        true,
        None::<&str>,
    )?;

    #[cfg(target_os = "macos")]
    let menu = {
        let about_icon = Image::from_path(
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("icons/256x256.png"),
        )?
        .to_owned();
        let about = PredefinedMenuItem::about(
            app,
            Some("About TerminalWisely"),
            Some(
                AboutMetadataBuilder::new()
                    .name(Some("TerminalWisely"))
                    .version(Some(env!("CARGO_PKG_VERSION")))
                    .short_version(Some(env!("CARGO_PKG_VERSION")))
                    .icon(Some(about_icon))
                    .build(),
            ),
        )?;
        let sep1 = PredefinedMenuItem::separator(app)?;
        let sep2 = PredefinedMenuItem::separator(app)?;
        let sep3 = PredefinedMenuItem::separator(app)?;
        let sep4 = PredefinedMenuItem::separator(app)?;
        let services = PredefinedMenuItem::services(app, None)?;
        let hide = PredefinedMenuItem::hide(app, None)?;
        let hide_others = PredefinedMenuItem::hide_others(app, None)?;
        let show_all = PredefinedMenuItem::show_all(app, None)?;
        let quit = PredefinedMenuItem::quit(app, None)?;

        // First submenu is the macOS application menu (TerminalWisely ▾).
        let app_menu = SubmenuBuilder::new(app, "TerminalWisely")
            .item(&about)
            .item(&sep1)
            .item(&check)
            .item(&sep2)
            .item(&settings)
            .item(&sep3)
            .item(&services)
            .item(&sep4)
            .item(&hide)
            .item(&hide_others)
            .item(&show_all)
            .separator()
            .item(&quit)
            .build()?;

        let edit = SubmenuBuilder::new(app, "Edit")
            .undo()
            .redo()
            .separator()
            .cut()
            .copy()
            .paste()
            .select_all()
            .build()?;

        let window = SubmenuBuilder::new(app, "Window")
            .minimize()
            .maximize()
            .separator()
            .close_window()
            .build()?;

        MenuBuilder::new(app)
            .item(&app_menu)
            .item(&edit)
            .item(&window)
            .build()?
    };

    #[cfg(not(target_os = "macos"))]
    let menu = {
        // Undecorated windows may hide the bar on some WMs; Settings gear remains
        // as fallback. Help menu is the usual place for Check for Updates.
        let file = SubmenuBuilder::new(app, "File")
            .item(&settings)
            .separator()
            .quit()
            .build()?;
        let edit = SubmenuBuilder::new(app, "Edit")
            .undo()
            .redo()
            .separator()
            .cut()
            .copy()
            .paste()
            .select_all()
            .build()?;
        let help = SubmenuBuilder::new(app, "Help")
            .item(&check)
            .build()?;
        MenuBuilder::new(app)
            .item(&file)
            .item(&edit)
            .item(&help)
            .build()?
    };

    app.set_menu(menu)?;

    let handle = app.handle().clone();
    app.on_menu_event(move |_app, event| {
        let id = event.id().as_ref();
        let event_name = if id == MENU_CHECK_UPDATES {
            Some(EVENT_CHECK_UPDATES)
        } else if id == MENU_SETTINGS {
            Some(EVENT_OPEN_SETTINGS)
        } else {
            None
        };
        if let Some(name) = event_name {
            if let Some(window) = handle.get_webview_window("main") {
                let _ = window.emit(name, ());
            } else {
                let _ = handle.emit(name, ());
            }
        }
    });

    Ok(())
}

fn main() {
    for icon in [
        "icons/icon.ico",
        "icons/icon.icns",
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/app-icon.png",
        "icons/app-icon.svg",
    ] {
        println!("cargo:rerun-if-changed={icon}");
    }

    tauri_build::build()
}

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use anyhow::{anyhow, Result};
use once_cell::sync::Lazy;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum HostPlatform {
    Windows,
    Unix,
}

fn default_shell(platform: HostPlatform, shell_env: Option<&str>) -> PathBuf {
    match platform {
        HostPlatform::Windows => PathBuf::from("powershell.exe"),
        HostPlatform::Unix => shell_env
            .filter(|value| !value.trim().is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("/bin/sh")),
    }
}

fn host_platform() -> HostPlatform {
    if cfg!(windows) {
        HostPlatform::Windows
    } else {
        HostPlatform::Unix
    }
}

#[derive(Clone, serde::Serialize)]
struct OutputPayload {
    id: String,
    data: String,
}

struct TerminalHandle {
    writer: Box<dyn Write + Send>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    child: Box<dyn Child + Send + Sync>,
}

static TERMINALS: Lazy<Mutex<HashMap<String, TerminalHandle>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

pub fn start(app: AppHandle, cols: u16, rows: u16) -> Result<String> {
    let id = format!("local-terminal:{}", Uuid::new_v4());
    let pair = native_pty_system().openpty(PtySize {
        rows: rows.max(1),
        cols: cols.max(1),
        pixel_width: 0,
        pixel_height: 0,
    })?;
    let shell = default_shell(host_platform(), std::env::var("SHELL").ok().as_deref());
    let mut command = CommandBuilder::new(shell);
    if host_platform() == HostPlatform::Windows {
        command.arg("-NoLogo");
    }
    let child = pair.slave.spawn_command(command)?;
    drop(pair.slave);

    let master = Arc::new(Mutex::new(pair.master));
    let mut reader = master
        .lock()
        .map_err(|_| anyhow!("local terminal pty lock poisoned"))?
        .try_clone_reader()?;
    let writer = master
        .lock()
        .map_err(|_| anyhow!("local terminal pty lock poisoned"))?
        .take_writer()?;
    let id_for_reader = id.clone();
    let app_for_reader = app.clone();
    std::thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(size) => {
                    let _ = app_for_reader.emit(
                        "local-terminal-output",
                        OutputPayload {
                            id: id_for_reader.clone(),
                            data: String::from_utf8_lossy(&buffer[..size]).into_owned(),
                        },
                    );
                }
            }
        }
        let _ = app_for_reader.emit("local-terminal-exit", id_for_reader.clone());
        stop(&id_for_reader);
    });

    TERMINALS.lock().unwrap().insert(
        id.clone(),
        TerminalHandle {
            writer,
            master,
            child,
        },
    );
    Ok(id)
}

pub fn input(id: &str, data: &str) -> Result<()> {
    let mut terminals = TERMINALS.lock().unwrap();
    let terminal = terminals
        .get_mut(id)
        .ok_or_else(|| anyhow!("local terminal not found"))?;
    terminal.writer.write_all(data.as_bytes())?;
    terminal.writer.flush()?;
    Ok(())
}

pub fn resize(id: &str, cols: u16, rows: u16) -> Result<()> {
    let terminals = TERMINALS.lock().unwrap();
    let terminal = terminals
        .get(id)
        .ok_or_else(|| anyhow!("local terminal not found"))?;
    terminal
        .master
        .lock()
        .map_err(|_| anyhow!("local terminal pty lock poisoned"))?
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })?;
    Ok(())
}

pub fn stop(id: &str) {
    if let Some(mut terminal) = TERMINALS.lock().unwrap().remove(id) {
        let _ = terminal.child.kill();
        let _ = terminal.child.wait();
    }
}

#[cfg(test)]
mod tests {
    use super::{default_shell, HostPlatform};
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    use std::io::Read;
    use std::path::Path;

    #[test]
    fn windows_uses_powershell() {
        assert_eq!(
            default_shell(HostPlatform::Windows, Some("ignored.exe")),
            Path::new("powershell.exe")
        );
    }

    #[test]
    fn unix_uses_configured_shell_and_falls_back_when_missing() {
        assert_eq!(
            default_shell(HostPlatform::Unix, Some("/bin/zsh")),
            Path::new("/bin/zsh")
        );
        assert_eq!(
            default_shell(HostPlatform::Unix, Some("  ")),
            Path::new("/bin/sh")
        );
    }

    #[cfg(unix)]
    #[test]
    fn local_pty_accepts_input_resizes_and_returns_output() {
        let pair = native_pty_system()
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .unwrap();
        let command = CommandBuilder::new("/bin/sh");
        let mut child = pair.slave.spawn_command(command).unwrap();
        drop(pair.slave);
        pair.master
            .resize(PtySize {
                rows: 30,
                cols: 100,
                pixel_width: 0,
                pixel_height: 0,
            })
            .unwrap();
        let size = pair.master.get_size().unwrap();
        assert_eq!((size.cols, size.rows), (100, 30));
        let mut writer = pair.master.take_writer().unwrap();
        writer.write_all(b"echo local-pty-ok\nexit\n").unwrap();
        drop(writer);
        let mut output = String::new();
        pair.master
            .try_clone_reader()
            .unwrap()
            .read_to_string(&mut output)
            .unwrap();
        let _ = child.wait();
        assert!(output.contains("local-pty-ok"));
    }
}

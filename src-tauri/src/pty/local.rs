use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter};

use crate::error::{AppError, AppResult};
use crate::shell;
use crate::types::{SessionInfo, SessionKind, TerminalOutputPayload};

pub struct LocalSession {
    info: SessionInfo,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    home_dir: String,
    local_cwd: Arc<Mutex<String>>,
}

impl LocalSession {
    pub fn spawn(app: AppHandle, id: String, cols: u16, rows: u16) -> AppResult<Self> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::msg(e.to_string()))?;

        let shell = default_shell();
        let home_dir = dirs::home_dir()
            .map(|home| home.to_string_lossy().to_string())
            .unwrap_or_else(|| "/".to_string());
        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(&home_dir);

        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        #[cfg(target_os = "macos")]
        {
            cmd.env("CLICOLOR", "1");
            cmd.env(
                "LSCOLORS",
                "ExGxBxDxCxEgEdxbxgxcxd",
            );
        }

        #[cfg(not(windows))]
        {
            if shell.ends_with("bash") || shell.ends_with("zsh") || shell.ends_with("fish") {
                cmd.arg("-l");
            }
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::msg(e.to_string()))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| AppError::msg(e.to_string()))?;
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::msg(e.to_string()))?;

        let session_id = id.clone();
        let app_handle = app.clone();
        std::thread::spawn(move || read_loop(reader, app_handle, session_id));

        let info = SessionInfo {
            id,
            title: format!("Local ({shell})"),
            kind: SessionKind::Local,
            remote_home: None,
            server_id: Some("local".to_string()),
            os_id: None,
            os_name: None,
        };

        Ok(Self {
            info,
            writer: Arc::new(Mutex::new(writer)),
            master: Arc::new(Mutex::new(pair.master)),
            child: Arc::new(Mutex::new(child)),
            home_dir: home_dir.clone(),
            local_cwd: Arc::new(Mutex::new(home_dir)),
        })
    }

    pub fn info(&self) -> SessionInfo {
        self.info.clone()
    }

    pub fn current_cwd_display(&self) -> String {
        let cwd = self.local_cwd.lock().unwrap();
        shell::path_for_display(&self.home_dir, &cwd)
    }

    pub fn current_cwd_path(&self) -> String {
        self.local_cwd.lock().unwrap().clone()
    }

    pub fn home_dir_path(&self) -> String {
        self.home_dir.clone()
    }

    pub fn resolve_path(&self, path: &str) -> AppResult<PathBuf> {
        shell::resolve_local_path(path, &self.home_dir, &self.current_cwd_path())
    }

    pub fn write_input(&self, data: &str) -> AppResult<()> {
        {
            let mut cwd = self.local_cwd.lock().unwrap();
            shell::update_cwd_from_input(&mut cwd, &self.home_dir, data);
        }
        self.writer
            .lock()
            .unwrap()
            .write_all(data.as_bytes())
            .map_err(AppError::from)
    }

    pub fn enter_directory(&mut self, path: &str) -> AppResult<()> {
        let target = path.trim().trim_end_matches(['/', '\\']);
        if target.is_empty() || target == "." {
            #[cfg(windows)]
            return self.write_input("dir\r");
            #[cfg(not(windows))]
            return self.write_input("ls -G -F\r");
        }

        {
            let mut cwd = self.local_cwd.lock().unwrap();
            shell::apply_cd_target(&mut cwd, &self.home_dir, target);
        }

        #[cfg(windows)]
        let quoted = if target == "~" {
            "%USERPROFILE%".to_string()
        } else {
            shell::shell_cd_argument(target)
        };
        #[cfg(not(windows))]
        let quoted = shell::shell_cd_argument(target);
        #[cfg(windows)]
        let cmd = format!("cd {quoted}; dir\r");
        #[cfg(not(windows))]
        let cmd = format!("cd {quoted} && ls -G -F\r");
        self.write_input(&cmd)
    }

    pub fn resize(&self, cols: u16, rows: u16) -> AppResult<()> {
        self.master
            .lock()
            .unwrap()
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::msg(e.to_string()))
    }

    pub fn close(&mut self) -> AppResult<()> {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
        Ok(())
    }
}

fn read_loop(mut reader: Box<dyn Read + Send>, app: AppHandle, session_id: String) {
    let mut buf = [0u8; 8192];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let data = String::from_utf8_lossy(&buf[..n]).to_string();
                let _ = app.emit(
                    "terminal-output",
                    TerminalOutputPayload {
                        session_id: session_id.clone(),
                        data,
                    },
                );
            }
            Err(_) => break,
        }
    }
}

fn default_shell() -> String {
    #[cfg(windows)]
    {
        std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string())
    }
    #[cfg(not(windows))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

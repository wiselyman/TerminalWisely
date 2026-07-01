use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter};

use crate::error::{AppError, AppResult};
use crate::local_shell::{self, LocalUnixRunner};
use crate::shell;
use crate::types::{SessionInfo, SessionKind, TerminalOutputPayload};

pub struct LocalSession {
    info: SessionInfo,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    shell: String,
    home_dir: String,
    local_cwd: Arc<Mutex<String>>,
    unix_runner: Option<LocalUnixRunner>,
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

        let resolved = local_shell::resolve()?;
        let mut cmd = if resolved.unix_runner.is_some() {
            let mut builder = CommandBuilder::new(&resolved.shell_executable);
            builder.arg("-l");
            builder
        } else {
            let mut builder = CommandBuilder::new(&resolved.shell_executable);
            builder.cwd(&resolved.home_dir);
            builder
        };

        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        #[cfg(target_os = "linux")]
        {
            cmd.env("LS_OPTIONS", "--hyperlink=never");
        }

        #[cfg(target_os = "macos")]
        {
            cmd.env("CLICOLOR", "1");
            cmd.env(
                "LSCOLORS",
                "ExGxBxDxCxEgEdxbxgxcxd",
            );
        }

        if resolved.unix_runner.is_none() {
            #[cfg(not(windows))]
            {
                if resolved.shell_executable.ends_with("bash")
                    || resolved.shell_executable.ends_with("zsh")
                    || resolved.shell_executable.ends_with("fish")
                {
                    cmd.arg("-l");
                }
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
            title: resolved.info.title.clone(),
            kind: SessionKind::Local,
            remote_home: None,
            server_id: Some("local".to_string()),
            os_id: Some(resolved.info.os_id.clone()),
            os_name: Some(resolved.info.os_name.clone()),
        };

        Ok(Self {
            info,
            writer: Arc::new(Mutex::new(writer)),
            master: Arc::new(Mutex::new(pair.master)),
            child: Arc::new(Mutex::new(child)),
            shell: resolved.shell_executable,
            home_dir: resolved.home_dir.clone(),
            local_cwd: Arc::new(Mutex::new(resolved.home_dir)),
            unix_runner: resolved.unix_runner,
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

    pub fn unix_runner(&self) -> Option<&LocalUnixRunner> {
        self.unix_runner.as_ref()
    }

    pub fn uses_unix_shell(&self) -> bool {
        #[cfg(windows)]
        {
            return self.unix_runner.is_some();
        }
        #[cfg(not(windows))]
        {
            true
        }
    }

    pub fn resolve_host_path(&self, path: &str) -> AppResult<PathBuf> {
        let logical = shell::resolve_local_path(path, &self.home_dir, &self.current_cwd_path())?;
        #[cfg(windows)]
        if let Some(runner) = &self.unix_runner {
            return runner.to_windows_path(&logical.to_string_lossy());
        }
        Ok(logical)
    }

    pub fn resolve_path(&self, path: &str) -> AppResult<PathBuf> {
        self.resolve_host_path(path)
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
            if self.uses_unix_shell() {
                return self.write_input("ls -F\r");
            }
            return self.write_input("dir\r");
        }

        {
            let mut cwd = self.local_cwd.lock().unwrap();
            shell::apply_cd_target(&mut cwd, &self.home_dir, target);
        }

        let resolved = self.current_cwd_path();
        let list_flags = if self.uses_unix_shell() {
            "ls --color=auto -F"
        } else {
            #[cfg(target_os = "macos")]
            {
                "ls -G -F"
            }
            #[cfg(not(target_os = "macos"))]
            {
                "ls -F"
            }
        };
        let cmd = if self.uses_unix_shell() {
            let cd_arg = shell::shell_cd_argument(&shell::path_for_display(
                &self.home_dir,
                &resolved,
            ));
            format!("cd {cd_arg} && {list_flags}\r")
        } else {
            #[cfg(windows)]
            {
                shell::windows_cd_and_list_command(&self.shell, &resolved)
            }
            #[cfg(not(windows))]
            {
                unreachable!("non-Unix local shell is Windows-only")
            }
        };
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

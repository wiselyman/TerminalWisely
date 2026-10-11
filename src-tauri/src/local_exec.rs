//! Local command capture for the Home chat. Not a PTY and not an SSH session.

use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::ai_engineer::{assert_lease_ready, consume_lease};
use crate::error::{AppError, AppResult};

pub const LOCAL_SESSION_ID: &str = "local";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalCapture {
    pub command: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub timed_out: bool,
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
pub struct AiLocalExecRequest {
    pub command: String,
    pub call_id: Option<String>,
    pub timeout_seconds: Option<u64>,
    pub lease_id: Option<String>,
    pub requires_lease: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct AiLocalExecResult {
    pub command: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub timed_out: bool,
    pub session_id: String,
}

pub fn local_shell_argv(
    command: &str,
    shell: Option<&str>,
    comspec: Option<&str>,
    windows: bool,
) -> Vec<String> {
    if windows {
        let program = comspec
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("cmd.exe");
        vec![program.to_string(), "/C".to_string(), command.to_string()]
    } else {
        let program = shell
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("/bin/sh");
        vec![program.to_string(), "-c".to_string(), command.to_string()]
    }
}

pub fn capture_local_command(
    command: &str,
    timeout: Duration,
    shell: Option<&str>,
    comspec: Option<&str>,
    windows: bool,
) -> AppResult<LocalCapture> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err(AppError::msg("command required"));
    }
    let argv = local_shell_argv(trimmed, shell, comspec, windows);
    let mut child = Command::new(&argv[0])
        .args(&argv[1..])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let mut stdout_pipe = child.stdout.take();
    let mut stderr_pipe = child.stderr.take();
    let stdout_thread = std::thread::spawn(move || read_pipe(stdout_pipe.as_mut()));
    let stderr_thread = std::thread::spawn(move || read_pipe(stderr_pipe.as_mut()));
    let started = Instant::now();
    let mut timed_out = false;
    let mut exit_code = -1;
    loop {
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            timed_out = true;
            break;
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                exit_code = status.code().unwrap_or(-1);
                break;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(err) => return Err(err.into()),
        }
    }
    let stdout = stdout_thread.join().unwrap_or_default();
    let mut stderr = stderr_thread.join().unwrap_or_default();
    if timed_out && stderr.trim().is_empty() {
        stderr = "command timed out".to_string();
    }
    Ok(LocalCapture {
        command: trimmed.to_string(),
        stdout,
        stderr,
        exit_code,
        timed_out,
        session_id: LOCAL_SESSION_ID.to_string(),
    })
}

fn read_pipe(pipe: Option<&mut impl Read>) -> String {
    let Some(pipe) = pipe else {
        return String::new();
    };
    let mut buf = Vec::new();
    let _ = pipe.read_to_end(&mut buf);
    String::from_utf8_lossy(&buf).into_owned()
}

fn env_shell() -> (Option<String>, Option<String>, bool) {
    let windows = cfg!(windows);
    if windows {
        (None, std::env::var("ComSpec").ok(), true)
    } else {
        (std::env::var("SHELL").ok(), None, false)
    }
}

pub fn run_local_exec(request: AiLocalExecRequest) -> AppResult<AiLocalExecResult> {
    let command = request.command.trim().to_string();
    if command.is_empty() {
        return Err(AppError::msg("command required"));
    }
    let requires_lease = request.requires_lease.unwrap_or(false);
    let lease_id = request
        .lease_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    if requires_lease && lease_id.is_none() {
        return Err(AppError::msg(
            "mutation requires privilege lease — approve exact action first",
        ));
    }
    if let Some(lease_id) = lease_id.as_deref() {
        assert_lease_ready(lease_id, LOCAL_SESSION_ID, &command)?;
    }
    let seconds = request.timeout_seconds.unwrap_or(120).clamp(1, 86_400);
    let (shell, comspec, windows) = env_shell();
    let captured = capture_local_command(
        &command,
        Duration::from_secs(seconds),
        shell.as_deref(),
        comspec.as_deref(),
        windows,
    )?;
    if let Some(lease_id) = lease_id.as_deref() {
        if !captured.timed_out {
            consume_lease(lease_id, LOCAL_SESSION_ID, &command)?;
        }
    }
    Ok(AiLocalExecResult {
        command: captured.command,
        stdout: captured.stdout,
        stderr: captured.stderr,
        exit_code: captured.exit_code,
        timed_out: captured.timed_out,
        session_id: captured.session_id,
    })
}

#[cfg(test)]
mod tests {
    use super::{capture_local_command, local_shell_argv};
    use std::time::Duration;

    #[test]
    fn unix_shell_uses_dash_c() {
        let argv = local_shell_argv("echo TW_LOCAL_OK", Some("/bin/zsh"), None, false);
        assert_eq!(
            argv,
            vec![
                "/bin/zsh".to_string(),
                "-c".to_string(),
                "echo TW_LOCAL_OK".to_string()
            ]
        );
    }

    #[test]
    fn unix_shell_defaults_when_unset() {
        let argv = local_shell_argv("echo TW_LOCAL_OK", None, None, false);
        assert_eq!(argv[0], "/bin/sh");
        assert_eq!(argv[1], "-c");
    }

    #[test]
    fn windows_comspec_uses_slash_c() {
        let argv = local_shell_argv(
            "echo TW_LOCAL_OK",
            None,
            Some(r"C:\Windows\System32\cmd.exe"),
            true,
        );
        assert_eq!(argv[0], r"C:\Windows\System32\cmd.exe");
        assert_eq!(argv[1], "/C");
        assert_eq!(argv[2], "echo TW_LOCAL_OK");
    }

    #[test]
    fn windows_shell_defaults_when_unset() {
        let argv = local_shell_argv("echo TW_LOCAL_OK", None, Some("  "), true);
        assert_eq!(argv[0], "cmd.exe");
        assert_eq!(argv[1], "/C");
    }

    #[test]
    fn runs_echo_and_returns_stdout() {
        let windows = cfg!(windows);
        let shell = if windows {
            std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".into())
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into())
        };
        let got = capture_local_command(
            "echo TW_LOCAL_OK",
            Duration::from_secs(10),
            if windows { None } else { Some(shell.as_str()) },
            if windows { Some(shell.as_str()) } else { None },
            windows,
        )
        .expect("echo");
        assert!(got.stdout.contains("TW_LOCAL_OK"), "{}", got.stdout);
        assert_eq!(got.exit_code, 0);
        assert!(!got.timed_out);
        assert_eq!(got.session_id, "local");
    }

    #[test]
    fn timeout_sets_timed_out() {
        let windows = cfg!(windows);
        let shell = if windows {
            std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".into())
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into())
        };
        let command = if windows {
            "ping -n 8 127.0.0.1"
        } else {
            "sleep 5"
        };
        let got = capture_local_command(
            command,
            Duration::from_millis(400),
            if windows { None } else { Some(shell.as_str()) },
            if windows { Some(shell.as_str()) } else { None },
            windows,
        )
        .expect("timeout");
        assert!(got.timed_out);
        assert_eq!(got.session_id, "local");
    }
}

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::error::{AppError, AppResult};
use crate::preview_sudo;
use crate::session::SessionManager;
use crate::ssh::client::{exec_command_capture, ExecOutputCallback};
use crate::types::SessionKind;

use super::leases::{assert_lease_ready, consume_lease};

const MAX_STDOUT_CHARS: usize = 256 * 1024;

#[derive(Debug, Clone, Serialize)]
pub struct AiExecOutputPayload {
    pub call_id: String,
    pub stream: String,
    pub chunk: String,
}

#[derive(Debug, Deserialize)]
pub struct AiTerminalExecRequest {
    pub session_id: String,
    pub command: String,
    /// Sidecar tool_call id — enables live stdout/stderr events to the UI.
    pub call_id: Option<String>,
    pub sudo: Option<bool>,
    pub sudo_password: Option<String>,
    /// When set, PrivilegeLease hard-gate: exact command + session + expiry + one-shot.
    pub lease_id: Option<String>,
    /// If true, lease_id is mandatory (mutations).
    pub requires_lease: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct AiTerminalExecResult {
    pub command: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub timed_out: bool,
    pub session_id: String,
}

fn truncate(s: String, max: usize) -> String {
    if s.len() <= max {
        return s;
    }
    let mut out = s.chars().take(max).collect::<String>();
    out.push_str("\n…[truncated]");
    out
}

/// Peel a leading `sudo [flags…]` so we can run via non-interactive `sudo -S`
/// instead of hanging on an interactive password prompt.
fn peel_leading_sudo(command: &str) -> (String, bool) {
    let trimmed = command.trim();
    if trimmed.len() < 4 || !trimmed[..4].eq_ignore_ascii_case("sudo") {
        return (trimmed.to_string(), false);
    }
    let after = &trimmed[4..];
    if !after.is_empty() && !after.starts_with(|c: char| c.is_whitespace()) {
        return (trimmed.to_string(), false);
    }
    let mut rest = after.trim_start();
    loop {
        if rest.is_empty() {
            break;
        }
        let tok_end = rest.find(char::is_whitespace).unwrap_or(rest.len());
        let tok = &rest[..tok_end];
        if tok.is_empty() {
            break;
        }
        let t = tok.to_ascii_lowercase();
        let known = matches!(
            t.as_str(),
            "-n" | "--non-interactive"
                | "-s"
                | "-S"
                | "--stdin"
                | "-E"
                | "-H"
                | "-i"
                | "-k"
                | "-K"
                | "-v"
        );
        let with_arg = matches!(
            t.as_str(),
            "-u" | "--user" | "-g" | "--group" | "-p" | "--prompt" | "-C" | "--close-from"
        );
        if known {
            rest = rest[tok_end..].trim_start();
            continue;
        }
        if with_arg {
            rest = rest[tok_end..].trim_start();
            let arg_end = rest.find(char::is_whitespace).unwrap_or(rest.len());
            rest = rest[arg_end..].trim_start();
            continue;
        }
        break;
    }
    if rest.is_empty() {
        return (trimmed.to_string(), false);
    }
    (rest.to_string(), true)
}

/// Execute on the EXISTING session handle (extra SSH exec channel).
/// Never opens a second SSH login. Never scrapes the interactive PTY.
pub async fn ai_terminal_exec(
    request: AiTerminalExecRequest,
    app: AppHandle,
    sessions: State<'_, SessionManager>,
) -> AppResult<AiTerminalExecResult> {
    let command = request.command.trim().to_string();
    if command.is_empty() {
        return Err(AppError::msg("command required"));
    }

    let requires_lease = request.requires_lease.unwrap_or(false);
    let lease_id = request
        .lease_id
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    if requires_lease {
        let Some(lease_id) = lease_id.as_deref() else {
            return Err(AppError::msg(
                "mutation requires privilege lease — approve exact action first",
            ));
        };
        // Validate only — consume after a real exec so sudo password retries still work.
        assert_lease_ready(lease_id, &request.session_id, &command)?;
    } else if let Some(lease_id) = lease_id.as_deref() {
        assert_lease_ready(lease_id, &request.session_id, &command)?;
    }

    let (inner, peeled_sudo) = peel_leading_sudo(&command);
    let use_sudo = request.sudo.unwrap_or(false) || peeled_sudo;
    let exec_body = if use_sudo {
        inner
    } else {
        command.clone()
    };

    let on_output: Option<ExecOutputCallback> = request
        .call_id
        .as_deref()
        .filter(|id| !id.is_empty())
        .map(|call_id| {
            let app = app.clone();
            let call_id = call_id.to_string();
            Arc::new(move |stream: &str, chunk: &str| {
                let _ = app.emit(
                    "ai-exec-output",
                    AiExecOutputPayload {
                        call_id: call_id.clone(),
                        stream: stream.to_string(),
                        chunk: chunk.to_string(),
                    },
                );
            }) as ExecOutputCallback
        });

    let kind = sessions.session_kind(&request.session_id).await?;
    match kind {
        SessionKind::Ssh => {
            let snap = sessions.ssh_snapshot(&request.session_id).await?;
            let handle = snap.handle();
            let (stdout, stderr, code) = if use_sudo {
                // Never run bare interactive `sudo` on an exec channel — it hangs.
                let (o, e, c) = preview_sudo::exec_remote_sudo_ai_capture(
                    &handle,
                    &exec_body,
                    request.sudo_password.as_deref(),
                    "执行",
                    &command,
                    on_output.clone(),
                )
                .await?;
                (o, e, c)
            } else {
                let (o, e, c) = exec_command_capture(&handle, &command, on_output).await?;
                (o, e, c as i32)
            };
            if let Some(lease_id) = lease_id.as_deref() {
                consume_lease(lease_id, &request.session_id, &command)?;
            }
            Ok(AiTerminalExecResult {
                command,
                stdout: truncate(stdout, MAX_STDOUT_CHARS),
                stderr: truncate(stderr, 64 * 1024),
                exit_code: code,
                timed_out: false,
                session_id: request.session_id,
            })
        }
        SessionKind::Local => Err(AppError::msg(
            "AI terminal_exec on local sessions is not enabled (SSH targets only)",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::peel_leading_sudo;

    #[test]
    fn peels_simple_sudo() {
        let (inner, had) = peel_leading_sudo("sudo apt-get remove -y foo");
        assert!(had);
        assert_eq!(inner, "apt-get remove -y foo");
    }

    #[test]
    fn peels_sudo_n() {
        let (inner, had) = peel_leading_sudo("sudo -n true");
        assert!(had);
        assert_eq!(inner, "true");
    }

    #[test]
    fn leaves_non_sudo() {
        let (inner, had) = peel_leading_sudo("apt-get remove -y foo");
        assert!(!had);
        assert_eq!(inner, "apt-get remove -y foo");
    }
}

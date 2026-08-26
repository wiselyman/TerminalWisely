//! Long-running kubectl port-forward processes (local kubeconfig).
//! SSH jump hosts: start remote port-forward on the jump host (127.0.0.1); local
//! access requires the user to tunnel separately — we track/stop the remote job.

use std::collections::HashMap;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use anyhow::{anyhow, Context, Result};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::session::SessionManager;
use crate::ssh::client::exec_command_capture;

use super::{K8sClusterKind, K8sClusterTarget};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortForwardInfo {
    pub id: String,
    pub cluster_id: String,
    pub resource_kind: String,
    pub namespace: String,
    pub name: String,
    pub local_port: u16,
    pub remote_port: u16,
    /// "local" | "ssh_remote"
    pub mode: String,
}

enum ForwardHandle {
    Local(Child),
    /// Remote job kept alive by a background thread; kill via stored session command.
    SshRemote {
        session_id: String,
        remote_pid_hint: String,
    },
}

struct ActiveForward {
    info: PortForwardInfo,
    handle: ForwardHandle,
}

static FORWARDS: Lazy<Mutex<HashMap<String, ActiveForward>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn kubectl_pf_args(
    target: &K8sClusterTarget,
    resource_kind: &str,
    namespace: &str,
    name: &str,
    local_port: u16,
    remote_port: u16,
) -> Vec<String> {
    let kind = resource_kind.to_lowercase();
    let resource = if kind == "service" || kind == "svc" {
        format!("service/{name}")
    } else {
        format!("pod/{name}")
    };
    let mut args = Vec::new();
    if matches!(target.kind, K8sClusterKind::Kubeconfig) {
        if let Some(kubeconfig) = target
            .kubeconfig_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            args.push("--kubeconfig".into());
            args.push(kubeconfig.to_string());
        }
        if let Some(ctx) = target.context.as_deref().filter(|s| !s.is_empty()) {
            args.push("--context".into());
            args.push(ctx.to_string());
        }
    }
    args.push("port-forward".into());
    args.push(resource);
    args.push(format!("{local_port}:{remote_port}"));
    if !namespace.is_empty() {
        args.push("-n".into());
        args.push(namespace.into());
    }
    args
}

pub fn list_port_forwards() -> Vec<PortForwardInfo> {
    FORWARDS
        .lock()
        .unwrap()
        .values()
        .map(|f| f.info.clone())
        .collect()
}

pub async fn start_port_forward(
    target: &K8sClusterTarget,
    resource_kind: &str,
    namespace: &str,
    name: &str,
    local_port: u16,
    remote_port: u16,
    sessions: &SessionManager,
) -> Result<PortForwardInfo> {
    if local_port == 0 || remote_port == 0 {
        anyhow::bail!("ports must be non-zero");
    }
    let id = Uuid::new_v4().to_string();
    let args = kubectl_pf_args(
        target,
        resource_kind,
        namespace,
        name,
        local_port,
        remote_port,
    );

    let (handle, mode) = match target.kind {
        K8sClusterKind::Kubeconfig => {
            let mut cmd = Command::new(crate::k8s::resolve_tool("kubectl"));
            for a in &args {
                cmd.arg(a);
            }
            cmd.stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::piped());
            let child = cmd.spawn().context("failed to start kubectl port-forward")?;
            (ForwardHandle::Local(child), "local".to_string())
        }
        K8sClusterKind::SshKubectl => {
            let session_id = target
                .session_id
                .as_deref()
                .ok_or_else(|| anyhow!("ssh kubectl binding missing session_id"))?
                .to_string();
            // Start in background on jump host; track via nohup pid file pattern.
            let remote_cmd = format!(
                "nohup kubectl {} >/tmp/tw-k8s-pf-{}.log 2>&1 & echo $!",
                shell_join_ssh(&args),
                &id[..8]
            );
            let snap = sessions.ssh_snapshot(&session_id).await?;
            let (stdout, stderr, code) =
                exec_command_capture(&snap.handle(), &remote_cmd, None).await?;
            if code != 0 {
                anyhow::bail!(
                    "remote port-forward failed: {}",
                    if stderr.trim().is_empty() {
                        stdout
                    } else {
                        stderr
                    }
                );
            }
            let pid = stdout.trim().lines().last().unwrap_or("").trim().to_string();
            if pid.is_empty() {
                anyhow::bail!("remote port-forward did not return a pid");
            }
            (
                ForwardHandle::SshRemote {
                    session_id,
                    remote_pid_hint: pid,
                },
                "ssh_remote".to_string(),
            )
        }
    };

    let info = PortForwardInfo {
        id: id.clone(),
        cluster_id: target.id.clone(),
        resource_kind: resource_kind.to_string(),
        namespace: namespace.to_string(),
        name: name.to_string(),
        local_port,
        remote_port,
        mode,
    };
    FORWARDS.lock().unwrap().insert(
        id,
        ActiveForward {
            info: info.clone(),
            handle,
        },
    );
    Ok(info)
}

pub async fn stop_port_forward(id: &str, sessions: &SessionManager) -> Result<()> {
    let handle = {
        let mut guard = FORWARDS.lock().unwrap();
        let Some(active) = guard.remove(id) else {
            anyhow::bail!("port-forward not found");
        };
        active.handle
    };
    match handle {
        ForwardHandle::Local(mut child) => {
            let _ = child.kill();
            let _ = child.wait();
        }
        ForwardHandle::SshRemote {
            session_id,
            remote_pid_hint,
        } => {
            let snap = sessions.ssh_snapshot(&session_id).await?;
            let kill_cmd = format!("kill {remote_pid_hint} 2>/dev/null || true");
            let _ = exec_command_capture(&snap.handle(), &kill_cmd, None).await;
        }
    }
    Ok(())
}

fn shell_join_ssh(parts: &[String]) -> String {
    parts
        .iter()
        .map(|p| {
            if p.chars()
                .any(|c| c.is_whitespace() || c == '\'' || c == '"')
            {
                format!("'{p}'")
            } else {
                p.clone()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Open an OS terminal window running the given shell command (local pod shell).
pub fn open_local_terminal_command(command: &str) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        let escaped = command
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('$', "\\$");
        let script = format!("tell application \"Terminal\" to do script \"{escaped}\"");
        let status = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .status()
            .context("osascript")?;
        if !status.success() {
            anyhow::bail!("failed to open Terminal.app");
        }
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        let status = Command::new("cmd")
            .args(["/C", "start", "cmd", "/K", command])
            .status()
            .context("cmd start")?;
        if !status.success() {
            anyhow::bail!("failed to open cmd");
        }
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        for term in [
            "x-terminal-emulator",
            "gnome-terminal",
            "konsole",
            "xfce4-terminal",
            "xterm",
        ] {
            let result = Command::new(term)
                .args(["-e", "bash", "-lc", command])
                .spawn();
            if result.is_ok() {
                return Ok(());
            }
        }
        anyhow::bail!("no terminal emulator found");
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = command;
        anyhow::bail!("open local terminal unsupported on this platform");
    }
}

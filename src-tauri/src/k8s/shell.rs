//! In-app PTY for `kubectl exec` on local kubeconfig clusters.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use anyhow::{anyhow, Result};
use once_cell::sync::Lazy;
use portable_pty::{native_pty_system, CommandBuilder, Child, MasterPty, PtySize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use super::{K8sClusterKind, K8sClusterTarget};

#[derive(Debug, Clone, serde::Serialize)]
pub struct K8sPodShellInfo {
    pub id: String,
    pub namespace: String,
    pub pod: String,
}

#[derive(Clone, serde::Serialize)]
struct K8sShellOutputPayload {
    shell_id: String,
    data: String,
}

#[derive(Clone, serde::Serialize)]
struct K8sShellExitPayload {
    shell_id: String,
}

struct PodShellHandle {
    writer: Box<dyn Write + Send>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    child: Box<dyn Child + Send + Sync>,
}

static POD_SHELLS: Lazy<Mutex<HashMap<String, PodShellHandle>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

pub fn start_pod_shell(
    app: AppHandle,
    target: &K8sClusterTarget,
    namespace: &str,
    pod: &str,
    container: Option<&str>,
    cols: u16,
    rows: u16,
) -> Result<K8sPodShellInfo> {
    if !matches!(target.kind, K8sClusterKind::Kubeconfig) {
        return Err(anyhow!(
            "embedded pod shell requires a local kubeconfig cluster"
        ));
    }
    let context = target
        .context
        .as_deref()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| anyhow!("missing kubeconfig context"))?;

    let id = format!("k8s-shell:{}", Uuid::new_v4());
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    let mut cmd = CommandBuilder::new(crate::k8s::resolve_tool("kubectl"));
    if let Some(kubeconfig) = target
        .kubeconfig_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        cmd.arg("--kubeconfig");
        cmd.arg(kubeconfig);
    }
    cmd.arg("--context");
    cmd.arg(context);
    cmd.arg("--namespace");
    cmd.arg(namespace);
    cmd.arg("exec");
    cmd.arg("-it");
    cmd.arg(pod);
    if let Some(c) = container.filter(|s| !s.is_empty()) {
        cmd.arg("-c");
        cmd.arg(c);
    }
    cmd.arg("--");
    cmd.arg("/bin/sh");

    let child = pair.slave.spawn_command(cmd)?;
    drop(pair.slave);

    let master = Arc::new(Mutex::new(pair.master));
    let mut reader = master
        .lock()
        .map_err(|_| anyhow!("pty lock poisoned"))?
        .try_clone_reader()?;
    let writer = master
        .lock()
        .map_err(|_| anyhow!("pty lock poisoned"))?
        .take_writer()?;

    let app_read = app.clone();
    let id_read = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                    let _ = app_read.emit(
                        "k8s-shell-output",
                        K8sShellOutputPayload {
                            shell_id: id_read.clone(),
                            data,
                        },
                    );
                }
                Err(_) => break,
            }
        }
        let _ = app_read.emit(
            "k8s-shell-exit",
            K8sShellExitPayload {
                shell_id: id_read.clone(),
            },
        );
        let _ = stop_pod_shell(&id_read);
    });

    POD_SHELLS.lock().unwrap().insert(
        id.clone(),
        PodShellHandle {
            writer,
            master,
            child,
        },
    );

    Ok(K8sPodShellInfo {
        id,
        namespace: namespace.to_string(),
        pod: pod.to_string(),
    })
}

pub fn pod_shell_input(id: &str, data: &str) -> Result<()> {
    let mut shells = POD_SHELLS.lock().unwrap();
    let handle = shells
        .get_mut(id)
        .ok_or_else(|| anyhow!("pod shell session not found"))?;
    handle.writer.write_all(data.as_bytes())?;
    handle.writer.flush()?;
    Ok(())
}

pub fn pod_shell_resize(id: &str, cols: u16, rows: u16) -> Result<()> {
    let shells = POD_SHELLS.lock().unwrap();
    let handle = shells
        .get(id)
        .ok_or_else(|| anyhow!("pod shell session not found"))?;
    let master = handle
        .master
        .lock()
        .map_err(|_| anyhow!("pty lock poisoned"))?;
    master.resize(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })?;
    Ok(())
}

pub fn stop_pod_shell(id: &str) -> Result<()> {
    let mut shells = POD_SHELLS.lock().unwrap();
    if let Some(mut handle) = shells.remove(id) {
        let _ = handle.child.kill();
        let _ = handle.child.wait();
    }
    Ok(())
}

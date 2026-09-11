use anyhow::Result;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::Mutex as AsyncMutex;

use crate::session::SessionManager;
use crate::ssh::client::exec_command_capture;

use super::bindings::{ssh_binding_access, update_ssh_binding_access, update_ssh_binding_session};
use super::ssh_kubectl::{
    build_ssh_kubectl_command, build_ssh_tool_command, is_k3s_kubeconfig_permission_error,
    kubectl_client_version, resolve_ssh_kubectl_access, SshKubectlAccess, SshKubectlProbe,
};
use super::{K8sClusterKind, K8sClusterTarget, KubectlResult};

pub use super::ssh_kubectl::{build_ssh_tool_command as build_ssh_helm_command, wrap_ssh_login_shell};

static SSH_ACCESS_RESOLVE_LOCKS: Lazy<StdMutex<HashMap<String, Arc<AsyncMutex<()>>>>> =
    Lazy::new(|| StdMutex::new(HashMap::new()));

fn ssh_access_resolve_lock(cluster_id: &str) -> Arc<AsyncMutex<()>> {
    let mut map = SSH_ACCESS_RESOLVE_LOCKS.lock().unwrap();
    map.entry(cluster_id.to_string())
        .or_insert_with(|| Arc::new(AsyncMutex::new(())))
        .clone()
}

pub async fn run_kubectl(
    target: &K8sClusterTarget,
    args: &[String],
    sessions: &SessionManager,
) -> Result<KubectlResult> {
    match target.kind {
        K8sClusterKind::Kubeconfig => run_local_kubectl(target, args).await,
        K8sClusterKind::SshKubectl => run_ssh_kubectl(target, args, sessions).await,
    }
}

async fn run_local_kubectl(target: &K8sClusterTarget, args: &[String]) -> Result<KubectlResult> {
    let context = target
        .context
        .as_deref()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| anyhow::anyhow!("missing kubeconfig context"))?;
    let mut cmd = tokio::process::Command::new(crate::k8s::resolve_tool("kubectl"));
    if let Some(kubeconfig) = target
        .kubeconfig_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        cmd.arg("--kubeconfig").arg(kubeconfig);
    }
    cmd.arg("--context").arg(context);
    for a in args {
        cmd.arg(a);
    }
    cmd.stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    let output = match cmd.output().await {
        Ok(o) => o,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            anyhow::bail!(
                "kubectl not found. Use Install kubectl in the Kubernetes panel, or bind an SSH host that has kubectl."
            );
        }
        Err(err) => {
            return Err(anyhow::Error::new(err).context("kubectl failed to start"));
        }
    };
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let exit_code = output.status.code().unwrap_or(-1);
    let parsed = if stdout.trim_start().starts_with('{') || stdout.trim_start().starts_with('[') {
        serde_json::from_str(&stdout).ok()
    } else {
        None
    };
    let stderr_clone = stderr.clone();
    Ok(KubectlResult {
        ok: output.status.success(),
        stdout,
        stderr,
        exit_code,
        parsed,
        error: if output.status.success() {
            None
        } else {
            Some(stderr_clone)
        },
    })
}

pub async fn ssh_snapshot_for_target(
    target: &K8sClusterTarget,
    sessions: &SessionManager,
) -> Result<crate::ssh::client::SshSessionSnapshot> {
    if let Some(session_id) = target.session_id.as_deref() {
        if let Ok(snap) = sessions.ssh_snapshot(session_id).await {
            return Ok(snap);
        }
    }
    let server_id = target
        .server_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| anyhow::anyhow!("ssh kubectl binding missing session_id"))?;
    let session_id = sessions
        .find_ssh_session_by_server_id(server_id)
        .await
        .ok_or_else(|| {
            anyhow::anyhow!(
                "SSH session for {server_id} is not connected — open the host in Terminal and retry"
            )
        })?;
    let _ = update_ssh_binding_session(&target.id, &session_id);
    sessions.ssh_snapshot(&session_id).await.map_err(Into::into)
}

fn ssh_kubectl_access_for_target(target: &K8sClusterTarget) -> SshKubectlAccess {
    let from_target = SshKubectlAccess::from_target(target);
    if from_target.is_persisted() {
        return from_target;
    }
    // Frontend invoke payloads often omit kubeconfig until refreshClusters.
    // Reuse access already resolved into the bindings store so each overview
    // kubectl does not re-run the multi-strategy 5s probe loop.
    if let Some((kubeconfig_path, use_sudo)) = ssh_binding_access(&target.id) {
        return SshKubectlAccess {
            kubeconfig_path,
            use_sudo,
        };
    }
    from_target
}

async fn run_ssh_kubectl(
    target: &K8sClusterTarget,
    args: &[String],
    sessions: &SessionManager,
) -> Result<KubectlResult> {
    let snap = ssh_snapshot_for_target(target, sessions).await?;
    let handle = snap.handle();

    let mut access = ssh_kubectl_access_for_target(target);
    let mut command = build_ssh_kubectl_command(&access, args);
    let (stdout, stderr, code) = exec_command_capture(&handle, &command, None).await?;

    if code != 0
        && (is_k3s_kubeconfig_permission_error(&stderr)
            || is_k3s_kubeconfig_permission_error(&stdout)
            || !access.is_persisted())
    {
        let lock = ssh_access_resolve_lock(&target.id);
        let _guard = lock.lock().await;
        // Another concurrent kubectl may have finished resolving while we waited.
        access = ssh_kubectl_access_for_target(target);
        if access.is_persisted() {
            command = build_ssh_kubectl_command(&access, args);
            let retry = exec_command_capture(&handle, &command, None).await?;
            return Ok(kubectl_result_from(retry.0, retry.1, retry.2));
        }
        if let Ok(resolved) = resolve_ssh_kubectl_access(&handle).await {
            let _ = update_ssh_binding_access(
                &target.id,
                resolved.kubeconfig_path.clone(),
                resolved.use_sudo,
            );
            access = resolved;
            command = build_ssh_kubectl_command(&access, args);
            let retry = exec_command_capture(&handle, &command, None).await?;
            return Ok(kubectl_result_from(retry.0, retry.1, retry.2));
        }
    }

    Ok(kubectl_result_from(stdout, stderr, code))
}

fn kubectl_result_from(stdout: String, stderr: String, code: u32) -> KubectlResult {
    let parsed = if stdout.trim_start().starts_with('{') || stdout.trim_start().starts_with('[') {
        serde_json::from_str(&stdout).ok()
    } else {
        None
    };
    let stderr_clone = stderr.clone();
    KubectlResult {
        ok: code == 0,
        stdout,
        stderr,
        exit_code: code as i32,
        parsed,
        error: if code == 0 {
            None
        } else {
            Some(stderr_clone)
        },
    }
}

/// Verify kubectl exists and can reach a cluster on the SSH session before binding.
pub async fn probe_ssh_kubectl(
    session_id: &str,
    sessions: &SessionManager,
) -> Result<SshKubectlProbe> {
    let snap = sessions.ssh_snapshot(session_id).await?;
    let handle = snap.handle();
    match resolve_ssh_kubectl_access(&handle).await {
        Ok(access) => {
            let version = kubectl_client_version(&handle, &access).await;
            Ok(SshKubectlProbe {
                ok: true,
                version,
                error: None,
                kubeconfig_path: access.kubeconfig_path,
                kubectl_use_sudo: access.use_sudo,
            })
        }
        Err(error) => Ok(SshKubectlProbe {
            ok: false,
            version: None,
            error: Some(error),
            kubeconfig_path: None,
            kubectl_use_sudo: false,
        }),
    }
}

pub fn pod_shell_command(
    target: &K8sClusterTarget,
    namespace: &str,
    pod: &str,
    container: Option<&str>,
) -> String {
    let mut args = vec![
        "--namespace".into(),
        namespace.into(),
        "exec".into(),
        "-it".into(),
        pod.into(),
    ];
    if let Some(c) = container.filter(|s| !s.is_empty()) {
        args.push("-c".into());
        args.push(c.to_string());
    }
    args.push("--".into());
    args.push("/bin/sh".into());

    match target.kind {
        K8sClusterKind::Kubeconfig => {
            let kubectl = crate::k8s::resolve_tool("kubectl")
                .to_string_lossy()
                .into_owned();
            let mut parts = vec![kubectl];
            parts.extend(args);
            if let Some(kubeconfig) = target
                .kubeconfig_path
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                parts.insert(1, "--kubeconfig".into());
                parts.insert(2, kubeconfig.to_string());
            }
            if let Some(ctx) = target.context.as_deref() {
                let insert_at = if target.kubeconfig_path.as_deref().is_some() {
                    3
                } else {
                    1
                };
                parts.insert(insert_at, "--context".into());
                parts.insert(insert_at + 1, ctx.to_string());
            }
            shell_join(&parts)
        }
        K8sClusterKind::SshKubectl => {
            build_ssh_kubectl_command(&SshKubectlAccess::from_target(target), &args)
        }
    }
}

/// Lens-style host shell: privileged nsenter pod on the target node (kube-system).
pub const NODE_SHELL_NS: &str = "kube-system";
pub const NODE_SHELL_IMAGE: &str = "alpine:3.19";

pub fn node_shell_pod_name() -> String {
    let id = uuid::Uuid::new_v4().simple().to_string();
    format!("tw-nsh-{}", &id[..8])
}

pub fn node_shell_pod_overrides(node: &str) -> String {
    serde_json::json!({
        "spec": {
            "nodeName": node,
            "hostPID": true,
            "hostNetwork": true,
            "hostIPC": true,
            "restartPolicy": "Never",
            "tolerations": [
                {"key": "CriticalAddonsOnly", "operator": "Exists"},
                {"effect": "NoExecute", "operator": "Exists"}
            ],
            "containers": [{
                "name": "nsenter",
                "image": NODE_SHELL_IMAGE,
                "stdin": true,
                "stdinOnce": true,
                "tty": true,
                "imagePullPolicy": "IfNotPresent",
                "securityContext": {"privileged": true},
                "command": [
                    "nsenter", "--target", "1",
                    "--mount", "--uts", "--ipc", "--net", "--pid",
                    "--", "bash", "-l"
                ]
            }]
        }
    })
    .to_string()
}

pub fn node_shell_run_args(node: &str) -> Vec<String> {
    vec![
        "run".into(),
        node_shell_pod_name(),
        "-n".into(),
        NODE_SHELL_NS.into(),
        "--restart=Never".into(),
        "--rm".into(),
        "-i".into(),
        "--tty".into(),
        "--pod-running-timeout=1m".into(),
        format!("--image={NODE_SHELL_IMAGE}"),
        format!("--overrides={}", node_shell_pod_overrides(node)),
    ]
}

fn push_kubectl_target_parts(parts: &mut Vec<String>, target: &K8sClusterTarget) {
    if !matches!(target.kind, K8sClusterKind::Kubeconfig) {
        return;
    }
    if let Some(kubeconfig) = target
        .kubeconfig_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        parts.insert(0, kubeconfig.to_string());
        parts.insert(0, "--kubeconfig".into());
    }
    if let Some(ctx) = target.context.as_deref().filter(|s| !s.is_empty()) {
        let at = if target.kubeconfig_path.as_deref().is_some() {
            2
        } else {
            0
        };
        parts.insert(at, ctx.to_string());
        parts.insert(at, "--context".into());
    }
}

pub fn node_shell_command(target: &K8sClusterTarget, node: &str) -> String {
    match target.kind {
        K8sClusterKind::Kubeconfig => {
            let kubectl = crate::k8s::resolve_tool("kubectl")
                .to_string_lossy()
                .into_owned();
            let mut parts = node_shell_run_args(node);
            push_kubectl_target_parts(&mut parts, target);
            parts.insert(0, kubectl);
            shell_join(&parts)
        }
        K8sClusterKind::SshKubectl => {
            build_ssh_kubectl_command(&SshKubectlAccess::from_target(target), &node_shell_run_args(node))
        }
    }
}

/// Shell command that opens an interactive terminal with kubectl context configured.
pub fn kubectl_shell_command(target: &K8sClusterTarget) -> String {
    match target.kind {
        K8sClusterKind::Kubeconfig => {
            let mut exports = Vec::new();
            if let Some(kubeconfig) = target
                .kubeconfig_path
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                exports.push(format!(
                    "export KUBECONFIG='{}'",
                    kubeconfig.replace('\'', "'\\''")
                ));
            }
            if let Some(ctx) = target.context.as_deref().filter(|s| !s.is_empty()) {
                exports.push(format!(
                    "kubectl config use-context '{}' 2>/dev/null || true",
                    ctx.replace('\'', "'\\''")
                ));
            }
            let ctx_label = target
                .context
                .as_deref()
                .filter(|s| !s.is_empty())
                .unwrap_or(&target.display_name);
            if exports.is_empty() {
                format!(
                    "echo 'kubectl host: {}'; exec $SHELL -l",
                    target.display_name.replace('\'', "'\\''")
                )
            } else {
                format!(
                    "{}; echo 'kubectl context: {}'; exec $SHELL -l",
                    exports.join(" && "),
                    ctx_label.replace('\'', "'\\''")
                )
            }
        }
        K8sClusterKind::SshKubectl => {
            let access = SshKubectlAccess::from_target(target);
            let mut inner = String::new();
            if let Some(kubeconfig) = &access.kubeconfig_path {
                inner.push_str(&format!(
                    "export KUBECONFIG='{}'",
                    kubeconfig.replace('\'', "'\\''")
                ));
            }
            if access.use_sudo {
                inner.push_str("; alias kubectl='sudo -n kubectl'");
            }
            if inner.is_empty() {
                format!(
                    "echo 'kubectl host: {}'; exec $SHELL -l",
                    target.display_name.replace('\'', "'\\''")
                )
            } else {
                format!(
                    "{}; echo 'kubectl host: {}'; exec $SHELL -l",
                    inner,
                    target.display_name.replace('\'', "'\\''")
                )
            }
        }
    }
}

fn shell_join(parts: &[String]) -> String {
    parts
        .iter()
        .map(|p| {
            if p.chars().any(|c| c.is_whitespace() || c == '\'' || c == '"') {
                format!("'{p}'")
            } else {
                p.clone()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::k8s::{K8sClusterKind, K8sClusterTarget};

    #[test]
    fn node_shell_command_uses_nsenter_on_host() {
        let target = K8sClusterTarget {
            id: "t".into(),
            kind: K8sClusterKind::Kubeconfig,
            display_name: "local".into(),
            context: Some("default".into()),
            kubeconfig_path: None,
            kubectl_use_sudo: false,
            session_id: None,
            server_id: None,
            namespace: "default".into(),
        };
        let cmd = node_shell_command(&target, "ubuntu");
        assert!(cmd.contains("run tw-nsh-"));
        assert!(cmd.contains("nsenter"));
        assert!(cmd.contains("--pod-running-timeout=1m"));
        assert!(cmd.contains("ubuntu"));
    }

    #[test]
    fn node_shell_overrides_pin_node() {
        let raw = node_shell_pod_overrides("worker-1");
        assert!(raw.contains("worker-1"));
        assert!(raw.contains("hostPID"));
    }

    #[test]
    fn ssh_pod_shell_uses_resolved_access() {
        let target = K8sClusterTarget {
            id: "t".into(),
            kind: K8sClusterKind::SshKubectl,
            display_name: "jump".into(),
            context: None,
            kubeconfig_path: Some("$HOME/.terminal-wisely/k3s-kubeconfig.yaml".into()),
            kubectl_use_sudo: false,
            session_id: Some("s1".into()),
            server_id: None,
            namespace: "default".into(),
        };
        let cmd = pod_shell_command(&target, "default", "nginx", None);
        assert!(cmd.contains("KUBECONFIG="));
        assert!(cmd.contains("exec"));
        assert!(cmd.contains("nginx"));
    }
}

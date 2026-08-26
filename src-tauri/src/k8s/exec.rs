use anyhow::{Context, Result};

use crate::session::SessionManager;
use crate::ssh::client::exec_command_capture;

use super::{K8sClusterKind, K8sClusterTarget, KubectlResult};

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

async fn run_ssh_kubectl(
    target: &K8sClusterTarget,
    args: &[String],
    sessions: &SessionManager,
) -> Result<KubectlResult> {
    let session_id = target
        .session_id
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("ssh kubectl binding missing session_id"))?;
    let mut parts = vec!["kubectl".to_string()];
    parts.extend(args.iter().cloned());
    let command = shell_join(&parts);
    let snap = sessions.ssh_snapshot(session_id).await?;
    let handle = snap.handle();
    let (stdout, stderr, code) = exec_command_capture(&handle, &command, None).await?;
    let parsed = if stdout.trim_start().starts_with('{') || stdout.trim_start().starts_with('[') {
        serde_json::from_str(&stdout).ok()
    } else {
        None
    };
    let stderr_clone = stderr.clone();
    Ok(KubectlResult {
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
    })
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SshKubectlProbe {
    pub ok: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}

/// Verify kubectl exists and runs on the SSH session before binding it as a kubectl host.
pub async fn probe_ssh_kubectl(
    session_id: &str,
    sessions: &SessionManager,
) -> Result<SshKubectlProbe> {
    let snap = sessions.ssh_snapshot(session_id).await?;
    let handle = snap.handle();
    let probe_cmd = "command -v kubectl >/dev/null 2>&1 && \
        kubectl_path=$(command -v kubectl) && \
        test -n \"$kubectl_path\" && test -x \"$kubectl_path\" && \
        kubectl version --client --output=json 2>/dev/null";
    let (stdout, stderr, code) = exec_command_capture(&handle, probe_cmd, None).await?;
    if code != 0 {
        return Ok(SshKubectlProbe {
            ok: false,
            version: None,
            error: Some(if stderr.trim().is_empty() {
                "kubectl not found on this SSH host".into()
            } else {
                stderr.trim().to_string()
            }),
        });
    }
    if stdout.trim().is_empty() {
        return Ok(SshKubectlProbe {
            ok: false,
            version: None,
            error: Some("kubectl not found on this SSH host".into()),
        });
    }
    let version = parse_kubectl_client_version(&stdout);
    Ok(SshKubectlProbe {
        ok: true,
        version,
        error: None,
    })
}

fn parse_kubectl_client_version(stdout: &str) -> Option<String> {
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(stdout) {
        if let Some(v) = value
            .pointer("/clientVersion/gitVersion")
            .and_then(|x| x.as_str())
        {
            return Some(v.to_string());
        }
    }
    stdout
        .lines()
        .find(|l| l.contains("Client Version"))
        .map(|l| l.trim().to_string())
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

pub fn pod_shell_command(
    target: &K8sClusterTarget,
    namespace: &str,
    pod: &str,
    container: Option<&str>,
) -> String {
    let kubectl = match target.kind {
        K8sClusterKind::Kubeconfig => crate::k8s::resolve_tool("kubectl")
            .to_string_lossy()
            .into_owned(),
        K8sClusterKind::SshKubectl => "kubectl".into(),
    };
    let mut parts = vec![
        kubectl,
        "--namespace".into(),
        namespace.into(),
        "exec".into(),
        "-it".into(),
        pod.into(),
    ];
    if let Some(c) = container.filter(|s| !s.is_empty()) {
        parts.push("-c".into());
        parts.push(c.to_string());
    }
    parts.push("--".into());
    parts.push("/bin/sh".into());
    if matches!(target.kind, K8sClusterKind::Kubeconfig) {
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
    }
    shell_join(&parts)
}

/// Shell command that opens an interactive terminal with kubectl context configured.
pub fn kubectl_shell_command(target: &K8sClusterTarget) -> String {
    let mut exports = Vec::new();
    if matches!(target.kind, K8sClusterKind::Kubeconfig) {
        if let Some(kubeconfig) = target
            .kubeconfig_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            exports.push(format!("export KUBECONFIG='{}'", kubeconfig.replace('\'', "'\\''")));
        }
        if let Some(ctx) = target.context.as_deref().filter(|s| !s.is_empty()) {
            exports.push(format!(
                "kubectl config use-context '{}' 2>/dev/null || true",
                ctx.replace('\'', "'\\''")
            ));
        }
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

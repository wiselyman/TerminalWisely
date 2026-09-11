//! SSH jump-host kubectl access: auto-resolve k3s kubeconfig permissions.

use std::sync::Arc;

use russh::client;
use tokio::sync::Mutex;

use super::K8sClusterTarget;

pub const TW_K3S_KUBECONFIG: &str = "$HOME/.terminal-wisely/k3s-kubeconfig.yaml";
const K3S_SYSTEM_KUBECONFIG: &str = "/etc/rancher/k3s/k3s.yaml";

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SshKubectlAccess {
    pub kubeconfig_path: Option<String>,
    pub use_sudo: bool,
}

impl SshKubectlAccess {
    pub fn from_target(target: &K8sClusterTarget) -> Self {
        Self {
            kubeconfig_path: target
                .kubeconfig_path
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string),
            use_sudo: target.kubectl_use_sudo,
        }
    }

    pub fn is_persisted(&self) -> bool {
        self.kubeconfig_path.is_some() || self.use_sudo
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SshKubectlProbe {
    pub ok: bool,
    pub version: Option<String>,
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kubeconfig_path: Option<String>,
    #[serde(default)]
    pub kubectl_use_sudo: bool,
}

pub fn wrap_ssh_login_shell(command: &str) -> String {
    format!("bash -lc {}", shell_quote_single(command))
}

pub fn shell_quote_single(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

pub fn is_k3s_kubeconfig_permission_error(detail: &str) -> bool {
    detail.contains(K3S_SYSTEM_KUBECONFIG) && detail.contains("permission denied")
}

pub fn build_ssh_tool_command(access: &SshKubectlAccess, tool: &str, args: &[String]) -> String {
    let mut inner = String::new();
    if let Some(kubeconfig) = &access.kubeconfig_path {
        inner.push_str(&format!("export KUBECONFIG={kubeconfig}; "));
    }
    if access.use_sudo {
        inner.push_str("sudo -n ");
    }
    inner.push_str(tool);
    if !args.is_empty() {
        inner.push(' ');
        inner.push_str(&shell_join(args));
    }
    wrap_ssh_login_shell(&inner)
}

pub fn build_ssh_kubectl_command(access: &SshKubectlAccess, args: &[String]) -> String {
    build_ssh_tool_command(access, "kubectl", args)
}

pub fn ssh_access_shell_prefix(access: &SshKubectlAccess) -> String {
    let mut prefix = String::new();
    if let Some(kubeconfig) = &access.kubeconfig_path {
        prefix.push_str(&format!("export KUBECONFIG={kubeconfig}; "));
    }
    prefix
}

pub fn ssh_kubectl_bin(access: &SshKubectlAccess) -> &'static str {
    if access.use_sudo {
        "sudo -n kubectl"
    } else {
        "kubectl"
    }
}

pub fn build_ssh_login_command(access: &SshKubectlAccess, inner: &str) -> String {
    wrap_ssh_login_shell(&format!("{}{inner}", ssh_access_shell_prefix(access)))
}

pub fn probe_failure_message(detail: &str) -> String {
    if detail.is_empty() {
        return "kubectl not found on this SSH host".into();
    }
    if is_k3s_kubeconfig_permission_error(detail)
        || (detail.contains("permission denied") && detail.contains("kubeconfig"))
    {
        return format!(
            "{detail}\n\n\
             Could not access the cluster automatically. \
             k3s auto-setup needs passwordless sudo (sudo -n) on this SSH host, \
             or a user-readable kubeconfig (~/.kube/config)."
        );
    }
    detail.to_string()
}

pub async fn resolve_ssh_kubectl_access(
    handle: &Arc<Mutex<client::Handle<crate::ssh::client::ClientHandler>>>,
) -> Result<SshKubectlAccess, String> {
    let strategies = [
        SshKubectlAccess::default(),
        SshKubectlAccess {
            kubeconfig_path: Some("$HOME/.kube/config".into()),
            use_sudo: false,
        },
        SshKubectlAccess {
            kubeconfig_path: Some(TW_K3S_KUBECONFIG.into()),
            use_sudo: false,
        },
    ];
    for access in strategies {
        if cluster_access_works(handle, &access).await {
            return Ok(access);
        }
    }

    if k3s_kubeconfig_present(handle).await && try_install_k3s_kubeconfig(handle).await {
        let access = SshKubectlAccess {
            kubeconfig_path: Some(TW_K3S_KUBECONFIG.into()),
            use_sudo: false,
        };
        if cluster_access_works(handle, &access).await {
            return Ok(access);
        }
    }

    let sudo_access = SshKubectlAccess {
        kubeconfig_path: None,
        use_sudo: true,
    };
    if cluster_access_works(handle, &sudo_access).await {
        return Ok(sudo_access);
    }

    let sudo_with_copy = SshKubectlAccess {
        kubeconfig_path: Some(TW_K3S_KUBECONFIG.into()),
        use_sudo: true,
    };
    if cluster_access_works(handle, &sudo_with_copy).await {
        return Ok(sudo_with_copy);
    }

    Err(probe_failure_message(
        "kubectl cannot reach the cluster on this SSH host (k3s kubeconfig not readable)",
    ))
}

pub async fn kubectl_client_version(
    handle: &Arc<Mutex<client::Handle<crate::ssh::client::ClientHandler>>>,
    access: &SshKubectlAccess,
) -> Option<String> {
    let cmd = build_ssh_kubectl_command(
        access,
        &[
            "version".into(),
            "--client".into(),
            "--output=json".into(),
        ],
    );
    let (stdout, _, code) = exec(handle, &cmd).await.ok()?;
    if code != 0 || stdout.trim().is_empty() {
        return None;
    }
    parse_kubectl_client_version(&stdout)
}

async fn cluster_access_works(
    handle: &Arc<Mutex<client::Handle<crate::ssh::client::ClientHandler>>>,
    access: &SshKubectlAccess,
) -> bool {
    let cmd = build_ssh_kubectl_command(
        access,
        &[
            "get".into(),
            "ns".into(),
            "--request-timeout=5s".into(),
            "-o".into(),
            "name".into(),
        ],
    );
    let (_, _, code) = exec(handle, &cmd).await.unwrap_or((String::new(), String::new(), 1));
    code == 0
}

async fn k3s_kubeconfig_present(
    handle: &Arc<Mutex<client::Handle<crate::ssh::client::ClientHandler>>>,
) -> bool {
    let cmd = wrap_ssh_login_shell(&format!("test -f {K3S_SYSTEM_KUBECONFIG}"));
    exec(handle, &cmd)
        .await
        .map(|(_, _, code)| code == 0)
        .unwrap_or(false)
}

async fn try_install_k3s_kubeconfig(
    handle: &Arc<Mutex<client::Handle<crate::ssh::client::ClientHandler>>>,
) -> bool {
    let cmd = wrap_ssh_login_shell(&format!(
        "test -f {K3S_SYSTEM_KUBECONFIG} && \
         mkdir -p \"$HOME/.terminal-wisely\" && \
         sudo -n cp {K3S_SYSTEM_KUBECONFIG} \"$HOME/.terminal-wisely/k3s-kubeconfig.yaml\" && \
         sudo -n chown \"$(id -u):$(id -g)\" \"$HOME/.terminal-wisely/k3s-kubeconfig.yaml\" && \
         chmod 600 \"$HOME/.terminal-wisely/k3s-kubeconfig.yaml\""
    ));
    exec(handle, &cmd)
        .await
        .map(|(_, _, code)| code == 0)
        .unwrap_or(false)
}

async fn exec(
    handle: &Arc<Mutex<client::Handle<crate::ssh::client::ClientHandler>>>,
    command: &str,
) -> Result<(String, String, u32), crate::error::AppError> {
    crate::ssh::client::exec_command_capture(handle, command, None).await
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_k3s_permission_error() {
        assert!(is_k3s_kubeconfig_permission_error(
            "error loading config file \"/etc/rancher/k3s/k3s.yaml\": permission denied"
        ));
    }

    #[test]
    fn build_kubectl_with_kubeconfig_and_sudo() {
        let access = SshKubectlAccess {
            kubeconfig_path: Some(TW_K3S_KUBECONFIG.into()),
            use_sudo: true,
        };
        let cmd = build_ssh_kubectl_command(&access, &["get".into(), "ns".into()]);
        assert!(cmd.contains("export KUBECONFIG="));
        assert!(cmd.contains("sudo -n"));
        assert!(cmd.contains("kubectl"));
        assert!(cmd.contains("get"));
    }

    #[test]
    fn probe_failure_mentions_sudo_not_manual_steps() {
        let msg = probe_failure_message(
            "open /etc/rancher/k3s/k3s.yaml: permission denied",
        );
        assert!(msg.contains("passwordless sudo"));
        assert!(!msg.contains("mkdir -p ~/.kube"));
    }
}

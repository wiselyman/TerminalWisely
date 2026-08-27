//! Helm / CRD helpers — app-managed or PATH binary; SSH uses remote PATH.

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::session::SessionManager;
use crate::ssh::client::exec_command_capture;

use super::exec::run_kubectl;
use super::summary::format_age;
use super::{K8sClusterKind, K8sClusterTarget, K8sResourceRow};

fn helm_updated_age(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(ts) = chrono::DateTime::parse_from_rfc3339(trimmed) {
        return Some(format_age(&ts.to_rfc3339()));
    }
    // Helm list JSON: "2024-03-15 10:22:33.123456789 +0000 UTC"
    let cleaned = trimmed
        .trim_end_matches(" UTC")
        .trim_end_matches(" utc")
        .trim();
    if let Ok(ts) =
        chrono::DateTime::parse_from_str(cleaned, "%Y-%m-%d %H:%M:%S%.f %z")
    {
        return Some(format_age(&ts.to_rfc3339()));
    }
    if let Ok(ts) = chrono::DateTime::parse_from_str(cleaned, "%Y-%m-%d %H:%M:%S %z") {
        return Some(format_age(&ts.to_rfc3339()));
    }
    None
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelmReleaseRow {
    pub name: String,
    pub namespace: String,
    pub revision: String,
    pub status: String,
    pub chart: String,
    pub app_version: String,
    #[serde(default)]
    pub updated: Option<String>,
}

async fn run_helm(
    target: &K8sClusterTarget,
    args: &[String],
    sessions: &SessionManager,
) -> Result<(bool, String, String)> {
    match target.kind {
        K8sClusterKind::Kubeconfig => {
            let mut cmd = tokio::process::Command::new(crate::k8s::resolve_tool("helm"));
            if let Some(kubeconfig) = target
                .kubeconfig_path
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                cmd.arg("--kubeconfig").arg(kubeconfig);
            }
            if let Some(ctx) = target.context.as_deref().filter(|s| !s.is_empty()) {
                cmd.arg("--kube-context").arg(ctx);
            }
            for a in args {
                cmd.arg(a);
            }
            cmd.stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped());
            let output = cmd.output().await.map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    anyhow!("helm not found. Use Install Helm in the Kubernetes panel.")
                } else {
                    anyhow!("helm failed to start: {e}")
                }
            })?;
            Ok((
                output.status.success(),
                String::from_utf8_lossy(&output.stdout).into_owned(),
                String::from_utf8_lossy(&output.stderr).into_owned(),
            ))
        }
        K8sClusterKind::SshKubectl => {
            let session_id = target
                .session_id
                .as_deref()
                .ok_or_else(|| anyhow!("ssh kubectl binding missing session_id"))?;
            let mut parts = vec!["helm".to_string()];
            parts.extend(args.iter().cloned());
            let command = parts
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
                .join(" ");
            let snap = sessions.ssh_snapshot(session_id).await?;
            let (stdout, stderr, code) =
                exec_command_capture(&snap.handle(), &command, None).await?;
            Ok((code == 0, stdout, stderr))
        }
    }
}

pub async fn list_helm_releases(
    target: &K8sClusterTarget,
    namespace: Option<&str>,
    sessions: &SessionManager,
) -> Result<Vec<HelmReleaseRow>> {
    let mut args = vec![
        "list".into(),
        "-o".into(),
        "json".into(),
    ];
    if let Some(ns) = namespace.filter(|s| !s.is_empty() && *s != "*") {
        args.push("-n".into());
        args.push(ns.to_string());
    } else {
        args.push("-A".into());
    }
    let (ok, stdout, stderr) = run_helm(target, &args, sessions).await?;
    if !ok {
        return Err(anyhow!(
            if stderr.trim().is_empty() {
                stdout
            } else {
                stderr
            }
        ));
    }
    let v: Value = serde_json::from_str(&stdout).unwrap_or(Value::Array(vec![]));
    let items = v.as_array().cloned().unwrap_or_default();
    let mut out = Vec::new();
    for item in items {
        out.push(HelmReleaseRow {
            name: item
                .get("name")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .into(),
            namespace: item
                .get("namespace")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .into(),
            revision: item
                .get("revision")
                .map(|x| match x {
                    Value::Number(n) => n.to_string(),
                    Value::String(s) => s.clone(),
                    _ => String::new(),
                })
                .unwrap_or_default(),
            status: item
                .get("status")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .into(),
            chart: item
                .get("chart")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .into(),
            app_version: item
                .get("app_version")
                .or_else(|| item.get("appVersion"))
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .into(),
            updated: item
                .get("updated")
                .and_then(|x| x.as_str())
                .and_then(helm_updated_age),
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

pub async fn helm_release_values(
    target: &K8sClusterTarget,
    namespace: &str,
    name: &str,
    sessions: &SessionManager,
) -> Result<String> {
    let mut args = vec![
        "get".into(),
        "values".into(),
        name.into(),
        "-o".into(),
        "yaml".into(),
    ];
    if !namespace.is_empty() {
        args.push("-n".into());
        args.push(namespace.into());
    }
    let (ok, stdout, stderr) = run_helm(target, &args, sessions).await?;
    if ok {
        Ok(stdout)
    } else {
        Err(anyhow!(
            if stderr.trim().is_empty() {
                stdout
            } else {
                stderr
            }
        ))
    }
}

pub async fn list_crd_instances(
    target: &K8sClusterTarget,
    plural_or_kind: &str,
    namespace: Option<&str>,
    sessions: &SessionManager,
) -> Result<Vec<K8sResourceRow>> {
    let mut args = vec![
        "get".into(),
        plural_or_kind.into(),
        "-o".into(),
        "json".into(),
    ];
    if let Some(ns) = namespace.filter(|s| !s.is_empty() && *s != "*") {
        args.push("-n".into());
        args.push(ns.to_string());
    } else {
        args.push("-A".into());
    }
    let result = run_kubectl(target, &args, sessions).await?;
    if !result.ok {
        return Err(anyhow!(
            result.error.unwrap_or_else(|| result.stderr.clone())
        ));
    }
    let v: Value = serde_json::from_str(&result.stdout)?;
    let items = v
        .get("items")
        .and_then(|i| i.as_array())
        .cloned()
        .unwrap_or_default();
    let mut rows = Vec::new();
    for item in items {
        let meta = item.get("metadata").unwrap_or(&Value::Null);
        let name = meta
            .get("name")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let namespace = meta
            .get("namespace")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let kind = item
            .get("kind")
            .and_then(|x| x.as_str())
            .unwrap_or(plural_or_kind)
            .to_string();
        rows.push(K8sResourceRow {
            namespace,
            name,
            kind,
            status: None,
            age: meta
                .get("creationTimestamp")
                .and_then(|x| x.as_str())
                .map(format_age),
            extra: None,
            restarts: None,
            node: None,
            ready: None,
            cpu: None,
            memory: None,
        });
    }
    rows.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(rows)
}

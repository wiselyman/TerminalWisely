//! Helm / CRD helpers — app-managed or PATH binary; SSH uses remote PATH.

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::session::SessionManager;
use crate::ssh::client::exec_command_capture;

use super::exec::run_kubectl;
use super::summary::format_age;
use super::{K8sClusterKind, K8sClusterTarget, K8sResourceRow, KubectlResult};

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
pub struct HelmChartRow {
    pub name: String,
    pub version: String,
    pub app_version: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelmRepoRow {
    pub name: String,
    pub url: String,
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
            let command = crate::k8s::build_ssh_helm_command(
                &crate::k8s::ssh_kubectl::SshKubectlAccess::from_target(target),
                "helm",
                args,
            );
            let snap = crate::k8s::ssh_snapshot_for_target(target, sessions).await?;
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

fn helm_to_result(ok: bool, stdout: String, stderr: String) -> KubectlResult {
    let err_text = if stderr.trim().is_empty() {
        stdout.clone()
    } else {
        stderr.clone()
    };
    KubectlResult {
        ok,
        stdout,
        stderr,
        exit_code: if ok { 0 } else { 1 },
        parsed: None,
        error: if ok { None } else { Some(err_text) },
    }
}

pub fn helm_install_args(release: &str, chart: &str, namespace: &str) -> Vec<String> {
    vec![
        "install".into(),
        release.into(),
        chart.into(),
        "-n".into(),
        namespace.into(),
        "--create-namespace".into(),
    ]
}

pub fn helm_upgrade_args(release: &str, chart: &str, namespace: &str) -> Vec<String> {
    vec![
        "upgrade".into(),
        release.into(),
        chart.into(),
        "-n".into(),
        namespace.into(),
        "--reuse-values".into(),
    ]
}

pub fn helm_rollback_args(release: &str, namespace: &str) -> Vec<String> {
    vec![
        "rollback".into(),
        release.into(),
        "-n".into(),
        namespace.into(),
    ]
}

pub fn helm_uninstall_args(release: &str, namespace: &str) -> Vec<String> {
    vec![
        "uninstall".into(),
        release.into(),
        "-n".into(),
        namespace.into(),
    ]
}

async fn helm_with_values(
    target: &K8sClusterTarget,
    mut args: Vec<String>,
    values: Option<&str>,
    sessions: &SessionManager,
) -> Result<KubectlResult> {
    let values = values.map(str::trim).filter(|s| !s.is_empty());
    match target.kind {
        K8sClusterKind::Kubeconfig => {
            let tmp = if let Some(raw) = values {
                let path = std::env::temp_dir().join(format!(
                    "tw-helm-values-{}.yaml",
                    uuid::Uuid::new_v4()
                ));
                std::fs::write(&path, raw)?;
                args.push("-f".into());
                args.push(path.to_string_lossy().into_owned());
                Some(path)
            } else {
                None
            };
            let (ok, stdout, stderr) = run_helm(target, &args, sessions).await?;
            if let Some(path) = tmp {
                let _ = std::fs::remove_file(path);
            }
            Ok(helm_to_result(ok, stdout, stderr))
        }
        K8sClusterKind::SshKubectl => {
            if let Some(raw) = values {
                use base64::Engine;
                let b64 = base64::engine::general_purpose::STANDARD.encode(raw.as_bytes());
                let snap = crate::k8s::ssh_snapshot_for_target(target, sessions).await?;
                let quoted: Vec<String> = args
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
                    .collect();
                let helm_cmd = format!("helm {}", quoted.join(" "));
                let command = format!(
                    "f=$(mktemp) && echo '{b64}' | base64 -d > \"$f\" && {helm_cmd} -f \"$f\"; ec=$?; rm -f \"$f\"; exit $ec"
                );
                let (stdout, stderr, code) =
                    exec_command_capture(&snap.handle(), &command, None).await?;
                Ok(helm_to_result(code == 0, stdout, stderr))
            } else {
                let (ok, stdout, stderr) = run_helm(target, &args, sessions).await?;
                Ok(helm_to_result(ok, stdout, stderr))
            }
        }
    }
}

pub async fn list_helm_repos(
    target: &K8sClusterTarget,
    sessions: &SessionManager,
) -> Result<Vec<HelmRepoRow>> {
    let args = vec!["repo".into(), "list".into(), "-o".into(), "json".into()];
    let (ok, stdout, _stderr) = run_helm(target, &args, sessions).await?;
    if !ok {
        return Ok(vec![]);
    }
    let v: Value = serde_json::from_str(&stdout).unwrap_or(Value::Array(vec![]));
    let mut rows = Vec::new();
    if let Some(arr) = v.as_array() {
        for item in arr {
            let name = item
                .get("name")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            if name.is_empty() {
                continue;
            }
            rows.push(HelmRepoRow {
                name,
                url: item
                    .get("url")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string(),
            });
        }
    }
    Ok(rows)
}

pub async fn add_helm_repo(
    target: &K8sClusterTarget,
    name: &str,
    url: &str,
    sessions: &SessionManager,
) -> Result<KubectlResult> {
    let args = vec!["repo".into(), "add".into(), name.into(), url.into()];
    let (ok, stdout, stderr) = run_helm(target, &args, sessions).await?;
    if ok {
        let _ = run_helm(
            target,
            &["repo".into(), "update".into(), name.into()],
            sessions,
        )
        .await;
    }
    Ok(helm_to_result(ok, stdout, stderr))
}

pub async fn helm_chart_values(
    target: &K8sClusterTarget,
    chart: &str,
    sessions: &SessionManager,
) -> Result<String> {
    let args = vec!["show".into(), "values".into(), chart.into()];
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

pub async fn helm_install(
    target: &K8sClusterTarget,
    release: &str,
    chart: &str,
    namespace: &str,
    values: Option<&str>,
    sessions: &SessionManager,
) -> Result<KubectlResult> {
    helm_with_values(
        target,
        helm_install_args(release, chart, namespace),
        values,
        sessions,
    )
    .await
}

pub async fn helm_upgrade(
    target: &K8sClusterTarget,
    release: &str,
    chart: &str,
    namespace: &str,
    values: Option<&str>,
    sessions: &SessionManager,
) -> Result<KubectlResult> {
    let mut args = helm_upgrade_args(release, chart, namespace);
    if values.map(str::trim).filter(|s| !s.is_empty()).is_some() {
        args.retain(|a| a != "--reuse-values");
    }
    helm_with_values(target, args, values, sessions).await
}

pub async fn helm_rollback(
    target: &K8sClusterTarget,
    release: &str,
    namespace: &str,
    sessions: &SessionManager,
) -> Result<KubectlResult> {
    let (ok, stdout, stderr) =
        run_helm(target, &helm_rollback_args(release, namespace), sessions).await?;
    Ok(helm_to_result(ok, stdout, stderr))
}

pub async fn helm_uninstall(
    target: &K8sClusterTarget,
    release: &str,
    namespace: &str,
    sessions: &SessionManager,
) -> Result<KubectlResult> {
    let (ok, stdout, stderr) =
        run_helm(target, &helm_uninstall_args(release, namespace), sessions).await?;
    Ok(helm_to_result(ok, stdout, stderr))
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
            roles: None,
            version: None,
            taints: None,
            unschedulable: None,
            cpu_requests: None,
            cpu_limits: None,
            cpu_capacity: None,
            memory_requests: None,
            memory_limits: None,
            memory_capacity: None,
            disk_requests: None,
            disk_limits: None,
            disk_capacity: None,
        });
    }
    rows.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(rows)
}

pub async fn list_helm_charts(
    target: &K8sClusterTarget,
    sessions: &SessionManager,
) -> Result<Vec<HelmChartRow>> {
    let args = vec![
        "search".into(),
        "repo".into(),
        "-o".into(),
        "json".into(),
    ];
    let (ok, stdout, _stderr) = run_helm(target, &args, sessions).await?;
    if ok {
        if let Ok(rows) = serde_json::from_str::<Vec<HelmChartRow>>(&stdout) {
            if !rows.is_empty() {
                return Ok(rows);
            }
        }
        if let Ok(v) = serde_json::from_str::<Value>(&stdout) {
            if let Some(arr) = v.as_array() {
                let mut rows = Vec::new();
                for item in arr {
                    rows.push(HelmChartRow {
                        name: item
                            .get("name")
                            .and_then(|x| x.as_str())
                            .unwrap_or("")
                            .to_string(),
                        version: item
                            .get("version")
                            .and_then(|x| x.as_str())
                            .unwrap_or("")
                            .to_string(),
                        app_version: item
                            .get("app_version")
                            .and_then(|x| x.as_str())
                            .unwrap_or("")
                            .to_string(),
                        description: item
                            .get("description")
                            .and_then(|x| x.as_str())
                            .unwrap_or("")
                            .to_string(),
                    });
                }
                return Ok(rows);
            }
        }
    }
    Ok(vec![])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_args_create_namespace() {
        let args = helm_install_args("web", "bitnami/nginx", "demo");
        assert!(args.contains(&"install".into()));
        assert!(args.contains(&"--create-namespace".into()));
        assert_eq!(args[1], "web");
        assert_eq!(args[2], "bitnami/nginx");
    }

    #[test]
    fn rollback_args_include_namespace() {
        let args = helm_rollback_args("web", "demo");
        assert_eq!(args, vec!["rollback", "web", "-n", "demo"]);
    }
}

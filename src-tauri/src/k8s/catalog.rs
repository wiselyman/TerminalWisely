//! CRD catalog tree, Applications aggregation.

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

use crate::session::SessionManager;

use super::exec::run_kubectl;
use super::summary::format_age;
use super::{K8sClusterTarget, K8sResourceRow};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sCrdCatalogEntry {
    pub group: String,
    pub kind: String,
    pub plural: String,
    pub name: String,
    pub scope: String,
}

pub async fn list_crd_catalog(
    target: &K8sClusterTarget,
    sessions: &SessionManager,
) -> Result<Vec<K8sCrdCatalogEntry>> {
    let result = run_kubectl(
        target,
        &[
            "get".into(),
            "crd".into(),
            "-o".into(),
            "json".into(),
        ],
        sessions,
    )
    .await?;
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
    let mut out = Vec::new();
    for item in items {
        let meta = item.get("metadata").unwrap_or(&Value::Null);
        let spec = item.get("spec").unwrap_or(&Value::Null);
        let name = meta
            .get("name")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        if name.is_empty() {
            continue;
        }
        let group = spec
            .get("group")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let kind = spec
            .get("names")
            .and_then(|n| n.get("kind"))
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let plural = spec
            .get("names")
            .and_then(|n| n.get("plural"))
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let scope = spec
            .get("scope")
            .and_then(|x| x.as_str())
            .unwrap_or("Namespaced")
            .to_string();
        if group.is_empty() || plural.is_empty() {
            continue;
        }
        out.push(K8sCrdCatalogEntry {
            group,
            kind,
            plural,
            name,
            scope,
        });
    }
    out.sort_by(|a, b| {
        a.group
            .cmp(&b.group)
            .then_with(|| a.kind.cmp(&b.kind))
    });
    Ok(out)
}

fn app_key(labels: &Value) -> Option<String> {
    let obj = labels.as_object()?;
    for key in [
        "app.kubernetes.io/name",
        "app.kubernetes.io/instance",
        "app",
        "k8s-app",
    ] {
        if let Some(v) = obj.get(key).and_then(|x| x.as_str()) {
            let trimmed = v.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

fn workload_status(item: &Value, kind: &str) -> Option<String> {
    match kind {
        "Deployment" | "StatefulSet" | "ReplicaSet" => item
            .get("status")
            .and_then(|s| s.get("conditions"))
            .and_then(|c| c.as_array())
            .and_then(|arr| {
                arr.iter()
                    .find(|x| x.get("type").and_then(|t| t.as_str()) == Some("Available"))
                    .and_then(|a| a.get("status").and_then(|s| s.as_str()))
                    .map(|s| {
                        if s.eq_ignore_ascii_case("True") {
                            "Available".into()
                        } else {
                            "Unavailable".into()
                        }
                    })
            }),
        "DaemonSet" => item.get("status").map(|s| {
            let ready = s
                .get("numberReady")
                .and_then(|r| r.as_u64())
                .unwrap_or(0);
            let desired = s
                .get("desiredNumberScheduled")
                .and_then(|r| r.as_u64())
                .unwrap_or(ready);
            if ready >= desired && desired > 0 {
                "Ready".into()
            } else {
                format!("{ready}/{desired}")
            }
        }),
        _ => None,
    }
}

async fn fetch_workloads(
    target: &K8sClusterTarget,
    resource: &str,
    row_kind: &str,
    namespace: Option<&str>,
    sessions: &SessionManager,
) -> Result<Vec<(String, String, String, Option<String>)>> {
    let mut args = vec!["get".into(), resource.into(), "-o".into(), "json".into()];
    if let Some(ns) = namespace.filter(|s| !s.is_empty() && *s != "*") {
        args.push("-n".into());
        args.push(ns.to_string());
    } else {
        args.push("-A".into());
    }
    let result = run_kubectl(target, &args, sessions).await?;
    if !result.ok {
        return Ok(vec![]);
    }
    let v: Value = serde_json::from_str(&result.stdout)?;
    let items = v
        .get("items")
        .and_then(|i| i.as_array())
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for item in items {
        let meta = item.get("metadata").unwrap_or(&Value::Null);
        let name = meta
            .get("name")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let ns = meta
            .get("namespace")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let labels = meta.get("labels").unwrap_or(&Value::Null);
        let app = app_key(labels).unwrap_or_else(|| name.clone());
        let status = workload_status(&item, row_kind);
        out.push((ns, app, row_kind.to_string(), status));
    }
    Ok(out)
}

pub async fn list_applications(
    target: &K8sClusterTarget,
    namespace: Option<&str>,
    sessions: &SessionManager,
) -> Result<Vec<K8sResourceRow>> {
    let mut groups: BTreeMap<(String, String), (Vec<String>, Option<String>)> = BTreeMap::new();
    for (resource, kind) in [
        ("deployments", "Deployment"),
        ("statefulsets", "StatefulSet"),
        ("daemonsets", "DaemonSet"),
    ] {
        let items = fetch_workloads(target, resource, kind, namespace, sessions).await?;
        for (ns, app, k, status) in items {
            let entry = groups.entry((ns.clone(), app)).or_default();
            if !entry.0.contains(&k) {
                entry.0.push(k);
            }
            if status.as_deref() == Some("Unavailable") {
                entry.1 = Some("Unavailable".into());
            } else if entry.1.is_none() && status.is_some() {
                entry.1 = status;
            }
        }
    }
    let mut rows = Vec::new();
    for ((ns, app), (kinds, status)) in groups {
        rows.push(K8sResourceRow {
            namespace: ns.clone(),
            name: app.clone(),
            kind: "Application".into(),
            status,
            age: None,
            extra: Some(kinds.join(", ")),
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
    rows.sort_by(|a, b| a.namespace.cmp(&b.namespace).then_with(|| a.name.cmp(&b.name)));
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_key_prefers_standard_label() {
        let labels = serde_json::json!({
            "app": "legacy",
            "app.kubernetes.io/name": "my-app"
        });
        assert_eq!(app_key(&labels).as_deref(), Some("my-app"));
    }
}

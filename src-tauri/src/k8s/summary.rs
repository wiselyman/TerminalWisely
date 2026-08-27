use std::collections::HashMap;

use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::session::SessionManager;

use super::exec::run_kubectl;
use super::{K8sClusterTarget, K8sResourceRow};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sWarningEvent {
    pub namespace: String,
    pub name: String,
    pub kind: String,
    pub reason: String,
    pub message: String,
    pub age: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sClusterSummary {
    pub version: Option<String>,
    pub node_count: u32,
    pub pod_counts: HashMap<String, u32>,
    pub recent_warnings: Vec<K8sWarningEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sTopPodRow {
    pub namespace: String,
    pub name: String,
    pub cpu: Option<String>,
    pub memory: Option<String>,
}

pub fn format_age(iso: &str) -> String {
    let Ok(ts) = DateTime::parse_from_rfc3339(iso) else {
        return iso.to_string();
    };
    let now = Utc::now();
    let secs = now
        .signed_duration_since(ts.with_timezone(&Utc))
        .num_seconds()
        .max(0);
    if secs < 60 {
        return format!("{secs}s");
    }
    if secs < 3600 {
        return format!("{}m", secs / 60);
    }
    if secs < 86_400 {
        return format!("{}h", secs / 3600);
    }
    format!("{}d", secs / 86_400)
}

pub async fn cluster_summary(
    target: &K8sClusterTarget,
    sessions: &SessionManager,
) -> Result<K8sClusterSummary> {
    let version = fetch_server_version(target, sessions).await;
    let node_count = fetch_node_count(target, sessions).await.unwrap_or(0);
    let pod_counts = fetch_pod_phase_counts(target, sessions).await.unwrap_or_default();
    let recent_warnings = fetch_recent_warnings(target, sessions)
        .await
        .unwrap_or_default();
    Ok(K8sClusterSummary {
        version,
        node_count,
        pod_counts,
        recent_warnings,
    })
}

async fn fetch_server_version(
    target: &K8sClusterTarget,
    sessions: &SessionManager,
) -> Option<String> {
    let result = run_kubectl(target, &["version".into(), "-o".into(), "json".into()], sessions)
        .await
        .ok()?;
    if !result.ok {
        return None;
    }
    let v: Value = serde_json::from_str(&result.stdout).ok()?;
    v.pointer("/serverVersion/gitVersion")
        .and_then(|x| x.as_str())
        .map(String::from)
        .or_else(|| {
            v.pointer("/clientVersion/gitVersion")
                .and_then(|x| x.as_str())
                .map(String::from)
        })
}

async fn fetch_node_count(target: &K8sClusterTarget, sessions: &SessionManager) -> Result<u32> {
    let result = run_kubectl(
        target,
        &["get".into(), "nodes".into(), "-o".into(), "json".into()],
        sessions,
    )
    .await?;
    if !result.ok {
        return Err(anyhow!(
            result.error.unwrap_or_else(|| result.stderr.clone())
        ));
    }
    let v: Value = serde_json::from_str(&result.stdout)?;
    Ok(v.get("items")
        .and_then(|i| i.as_array())
        .map(|a| a.len() as u32)
        .unwrap_or(0))
}

async fn fetch_pod_phase_counts(
    target: &K8sClusterTarget,
    sessions: &SessionManager,
) -> Result<HashMap<String, u32>> {
    let result = run_kubectl(
        target,
        &[
            "get".into(),
            "pods".into(),
            "-A".into(),
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
    let mut counts: HashMap<String, u32> = HashMap::new();
    if let Some(items) = v.get("items").and_then(|i| i.as_array()) {
        for item in items {
            let phase = item
                .get("status")
                .and_then(|s| s.get("phase"))
                .and_then(|p| p.as_str())
                .unwrap_or("Unknown");
            *counts.entry(phase.to_string()).or_insert(0) += 1;
        }
    }
    Ok(counts)
}

async fn fetch_recent_warnings(
    target: &K8sClusterTarget,
    sessions: &SessionManager,
) -> Result<Vec<K8sWarningEvent>> {
    let result = run_kubectl(
        target,
        &[
            "get".into(),
            "events".into(),
            "-A".into(),
            "--field-selector=type=Warning".into(),
            "-o".into(),
            "json".into(),
        ],
        sessions,
    )
    .await?;
    if !result.ok {
        return Ok(vec![]);
    }
    let v: Value = serde_json::from_str(&result.stdout)?;
    let mut events: Vec<(Option<DateTime<Utc>>, K8sWarningEvent)> = Vec::new();
    if let Some(items) = v.get("items").and_then(|i| i.as_array()) {
        for item in items {
            let meta = item.get("metadata").unwrap_or(&Value::Null);
            let involved = item.get("involvedObject").unwrap_or(&Value::Null);
            let ts = item
                .get("lastTimestamp")
                .or_else(|| item.get("eventTime"))
                .or_else(|| meta.get("creationTimestamp"))
                .and_then(|x| x.as_str())
                .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                .map(|d| d.with_timezone(&Utc));
            let age = ts.as_ref().map(|t| format_age(&t.to_rfc3339()));
            events.push((
                ts,
                K8sWarningEvent {
                    namespace: involved
                        .get("namespace")
                        .or_else(|| meta.get("namespace"))
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string(),
                    name: involved
                        .get("name")
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string(),
                    kind: involved
                        .get("kind")
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string(),
                    reason: item
                        .get("reason")
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string(),
                    message: item
                        .get("message")
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string(),
                    age,
                },
            ));
        }
    }
    events.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(events.into_iter().take(12).map(|(_, e)| e).collect())
}

pub async fn top_pods(
    target: &K8sClusterTarget,
    namespace: Option<&str>,
    sessions: &SessionManager,
) -> Result<Vec<K8sTopPodRow>> {
    let mut args = vec!["top".into(), "pods".into(), "--no-headers".into()];
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
    let mut rows = Vec::new();
    for line in result.stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 3 {
            continue;
        }
        let (namespace, name, cpu, memory) = if parts.len() >= 4 && parts[0].contains('/') {
            let ns_name: Vec<&str> = parts[0].splitn(2, '/').collect();
            if ns_name.len() != 2 {
                continue;
            }
            (
                ns_name[0].to_string(),
                ns_name[1].to_string(),
                Some(parts[1].to_string()),
                Some(parts[2].to_string()),
            )
        } else if parts.len() >= 3 {
            (
                namespace.unwrap_or("default").to_string(),
                parts[0].to_string(),
                Some(parts[1].to_string()),
                Some(parts[2].to_string()),
            )
        } else {
            continue;
        };
        rows.push(K8sTopPodRow {
            namespace,
            name,
            cpu,
            memory,
        });
    }
    Ok(rows)
}

/// Merge top metrics into pod rows (keyed by namespace/name).
pub fn merge_top_into_rows(rows: &mut [K8sResourceRow], top: &[K8sTopPodRow]) {
    for row in rows.iter_mut() {
        if row.kind != "Pod" {
            continue;
        }
        if let Some(m) = top
            .iter()
            .find(|t| t.namespace == row.namespace && t.name == row.name)
        {
            row.cpu = m.cpu.clone();
            row.memory = m.memory.clone();
        }
    }
}

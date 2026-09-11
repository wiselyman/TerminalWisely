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
pub struct K8sClusterMetrics {
    pub cpu_usage: Option<String>,
    pub memory_usage: Option<String>,
    pub cpu_capacity: Option<String>,
    pub memory_capacity: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sClusterSummary {
    pub version: Option<String>,
    pub node_count: u32,
    pub ready_node_count: u32,
    pub namespace_count: u32,
    pub deployment_count: u32,
    pub service_count: u32,
    pub total_pods: u32,
    pub pod_capacity: u32,
    pub pod_counts: HashMap<String, u32>,
    pub recent_warnings: Vec<K8sWarningEvent>,
    pub metrics: Option<K8sClusterMetrics>,
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
    // Resolve SSH kubectl access once up front so parallel fetches below do not
    // each pay the multi-strategy probe (≈5s × strategies) on a stale target.
    let _ = run_kubectl(
        target,
        &with_request_timeout(
            vec!["get".into(), "namespaces".into(), "-o".into(), "name".into()],
            10,
        ),
        sessions,
    )
    .await;

    let (
        version,
        node_stats,
        namespace_count,
        deployment_count,
        service_count,
        pod_counts,
        recent_warnings,
        top,
    ) = tokio::join!(
        fetch_server_version(target, sessions),
        fetch_node_stats(target, sessions),
        fetch_namespace_count(target, sessions),
        fetch_resource_count(target, "deployments", sessions),
        fetch_resource_count(target, "services", sessions),
        fetch_pod_phase_counts(target, sessions),
        fetch_recent_warnings(target, sessions),
        fetch_top_nodes(target, sessions),
    );

    let (node_count, ready_node_count, cpu_capacity, memory_capacity, pod_capacity) =
        node_stats.unwrap_or((0, 0, None, None, 0));
    let namespace_count = namespace_count.unwrap_or(0);
    let deployment_count = deployment_count.unwrap_or(0);
    let service_count = service_count.unwrap_or(0);
    let pod_counts = pod_counts.unwrap_or_default();
    let total_pods: u32 = pod_counts.values().sum();
    let recent_warnings = recent_warnings.unwrap_or_default();
    let metrics = top.ok().map(|(cpu_usage, memory_usage)| K8sClusterMetrics {
        cpu_usage,
        memory_usage,
        cpu_capacity: cpu_capacity.clone(),
        memory_capacity: memory_capacity.clone(),
    });
    Ok(K8sClusterSummary {
        version,
        node_count,
        ready_node_count,
        namespace_count,
        deployment_count,
        service_count,
        total_pods,
        pod_capacity,
        pod_counts,
        recent_warnings,
        metrics,
    })
}

fn with_request_timeout(mut args: Vec<String>, secs: u32) -> Vec<String> {
    args.push(format!("--request-timeout={secs}s"));
    args
}

async fn fetch_server_version(
    target: &K8sClusterTarget,
    sessions: &SessionManager,
) -> Option<String> {
    let result = run_kubectl(
        target,
        &with_request_timeout(vec!["version".into(), "-o".into(), "json".into()], 10),
        sessions,
    )
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

async fn fetch_node_stats(
    target: &K8sClusterTarget,
    sessions: &SessionManager,
) -> Result<(u32, u32, Option<String>, Option<String>, u32)> {
    let result = run_kubectl(
        target,
        &with_request_timeout(
            vec!["get".into(), "nodes".into(), "-o".into(), "json".into()],
            15,
        ),
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
    let mut ready = 0u32;
    let mut cpu_milli: u64 = 0;
    let mut mem_ki: u64 = 0;
    let mut pod_cap: u32 = 0;
    for item in &items {
        let is_ready = item
            .get("status")
            .and_then(|s| s.get("conditions"))
            .and_then(|c| c.as_array())
            .map(|arr| {
                arr.iter().any(|x| {
                    x.get("type").and_then(|t| t.as_str()) == Some("Ready")
                        && x.get("status").and_then(|s| s.as_str()) == Some("True")
                })
            })
            .unwrap_or(false);
        if is_ready {
            ready += 1;
        }
        if let Some(cap) = item
            .get("status")
            .and_then(|s| s.get("allocatable"))
            .or_else(|| item.get("status").and_then(|s| s.get("capacity")))
        {
            if let Some(cpu) = cap.get("cpu").and_then(|x| x.as_str()) {
                cpu_milli += parse_cpu_milli(cpu);
            }
            if let Some(mem) = cap.get("memory").and_then(|x| x.as_str()) {
                mem_ki += parse_memory_ki(mem);
            }
            if let Some(pods) = cap.get("pods").and_then(|x| x.as_str()) {
                pod_cap = pod_cap.saturating_add(pods.parse().unwrap_or(0));
            }
        }
    }
    let total = items.len() as u32;
    Ok((
        total,
        ready,
        if cpu_milli > 0 {
            Some(format_cpu_milli(cpu_milli))
        } else {
            None
        },
        if mem_ki > 0 {
            Some(format_memory_ki(mem_ki))
        } else {
            None
        },
        pod_cap,
    ))
}

async fn fetch_namespace_count(
    target: &K8sClusterTarget,
    sessions: &SessionManager,
) -> Result<u32> {
    fetch_resource_count(target, "namespaces", sessions).await
}

async fn fetch_resource_count(
    target: &K8sClusterTarget,
    kind: &str,
    sessions: &SessionManager,
) -> Result<u32> {
    let mut args = vec!["get".into(), kind.into(), "-o".into(), "json".into()];
    if kind != "namespaces" && kind != "nodes" {
        args.push("-A".into());
    }
    let result = run_kubectl(target, &with_request_timeout(args, 15), sessions).await?;
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

pub async fn top_nodes_by_name(
    target: &K8sClusterTarget,
    sessions: &SessionManager,
) -> Result<HashMap<String, (Option<String>, Option<String>)>> {
    let result = run_kubectl(
        target,
        &with_request_timeout(
            vec!["top".into(), "nodes".into(), "--no-headers".into()],
            5,
        ),
        sessions,
    )
    .await?;
    if !result.ok {
        return Err(anyhow!("metrics unavailable"));
    }
    let mut out = HashMap::new();
    for line in result.stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.is_empty() {
            continue;
        }
        let name = parts[0].to_string();
        let (cpu_milli, mem_ki) = parse_top_node_line(line);
        out.insert(
            name,
            (
                if cpu_milli > 0 {
                    Some(format_cpu_milli(cpu_milli))
                } else {
                    None
                },
                if mem_ki > 0 {
                    Some(format_memory_ki(mem_ki))
                } else {
                    None
                },
            ),
        );
    }
    Ok(out)
}

async fn fetch_top_nodes(
    target: &K8sClusterTarget,
    sessions: &SessionManager,
) -> Result<(Option<String>, Option<String>)> {
    let result = run_kubectl(
        target,
        &with_request_timeout(
            vec!["top".into(), "nodes".into(), "--no-headers".into()],
            5,
        ),
        sessions,
    )
    .await?;
    if !result.ok {
        return Err(anyhow!("metrics unavailable"));
    }
    let mut cpu_milli: u64 = 0;
    let mut mem_ki: u64 = 0;
    for line in result.stdout.lines() {
        let (cpu, mem) = parse_top_node_line(line);
        cpu_milli += cpu;
        mem_ki += mem;
    }
    if cpu_milli == 0 && mem_ki == 0 {
        return Err(anyhow!("empty metrics"));
    }
    Ok((
        if cpu_milli > 0 {
            Some(format_cpu_milli(cpu_milli))
        } else {
            None
        },
        if mem_ki > 0 {
            Some(format_memory_ki(mem_ki))
        } else {
            None
        },
    ))
}

/// Parse one `kubectl top nodes` row. Modern kubectl emits CPU/MEM % columns:
/// `NAME  CPU(cores)  CPU%  MEMORY(bytes)  MEMORY%`
pub(crate) fn parse_top_node_line(line: &str) -> (u64, u64) {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 2 {
        return (0, 0);
    }
    parse_metric_values(&parts[1..])
}

fn parse_metric_values(tokens: &[&str]) -> (u64, u64) {
    let mut cpu_milli = 0u64;
    let mut mem_ki = 0u64;
    for token in tokens {
        if token.ends_with('%') {
            continue;
        }
        if looks_like_memory(token) {
            mem_ki += parse_memory_ki(token);
        } else if looks_like_cpu(token) {
            cpu_milli += parse_cpu_milli(token);
        }
    }
    (cpu_milli, mem_ki)
}

fn looks_like_memory(raw: &str) -> bool {
    raw.ends_with("Ki")
        || raw.ends_with("Mi")
        || raw.ends_with("Gi")
        || raw.parse::<u64>().ok().is_some_and(|n| n >= 1024 * 1024)
}

fn looks_like_cpu(raw: &str) -> bool {
    raw.ends_with('m') || raw.parse::<f64>().ok().is_some_and(|n| n > 0.0 && n < 512.0)
}

pub(crate) fn parse_cpu_milli(raw: &str) -> u64 {
    if let Some(m) = raw.strip_suffix('m') {
        return m.parse().unwrap_or(0);
    }
    raw.parse::<u64>().unwrap_or(0).saturating_mul(1000)
}

pub(crate) fn parse_memory_ki(raw: &str) -> u64 {
    if let Some(k) = raw.strip_suffix("Ki") {
        return k.parse().unwrap_or(0);
    }
    if let Some(m) = raw.strip_suffix("Mi") {
        return m.parse::<u64>().unwrap_or(0).saturating_mul(1024);
    }
    if let Some(g) = raw.strip_suffix("Gi") {
        return g.parse::<u64>().unwrap_or(0).saturating_mul(1024 * 1024);
    }
    // MEMORY(bytes) column may be a plain byte count.
    if let Ok(bytes) = raw.parse::<u64>() {
        return bytes / 1024;
    }
    0
}

pub(crate) fn format_cpu_milli(milli: u64) -> String {
    if milli >= 1000 {
        let cores = milli as f64 / 1000.0;
        format!("{cores:.2}")
    } else {
        format!("{milli}m")
    }
}

pub(crate) fn format_memory_ki(ki: u64) -> String {
    if ki >= 1024 * 1024 {
        format!("{:.1}Gi", ki as f64 / (1024.0 * 1024.0))
    } else if ki >= 1024 {
        format!("{:.1}Mi", ki as f64 / 1024.0)
    } else {
        format!("{ki}Ki")
    }
}

async fn fetch_pod_phase_counts(
    target: &K8sClusterTarget,
    sessions: &SessionManager,
) -> Result<HashMap<String, u32>> {
    let result = run_kubectl(
        target,
        &with_request_timeout(
            vec![
                "get".into(),
                "pods".into(),
                "-A".into(),
                "-o".into(),
                "json".into(),
            ],
            20,
        ),
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
        &with_request_timeout(
            vec![
                "get".into(),
                "events".into(),
                "-A".into(),
                "--field-selector=type=Warning".into(),
                "-o".into(),
                "json".into(),
            ],
            15,
        ),
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
        let (namespace, name, metric_tokens): (String, String, &[&str]) =
            if parts.len() >= 4 && parts[0].contains('/') {
                let ns_name: Vec<&str> = parts[0].splitn(2, '/').collect();
                if ns_name.len() != 2 {
                    continue;
                }
                (
                    ns_name[0].to_string(),
                    ns_name[1].to_string(),
                    &parts[1..],
                )
            } else if parts.len() >= 3 {
                (
                    namespace.unwrap_or("default").to_string(),
                    parts[0].to_string(),
                    &parts[1..],
                )
            } else {
                continue;
            };
        let (cpu_milli, mem_ki) = parse_metric_values(metric_tokens);
        rows.push(K8sTopPodRow {
            namespace,
            name,
            cpu: if cpu_milli > 0 {
                Some(format_cpu_milli(cpu_milli))
            } else {
                None
            },
            memory: if mem_ki > 0 {
                Some(format_memory_ki(mem_ki))
            } else {
                None
            },
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_top_node_line_with_percent_columns() {
        let (cpu, mem) = parse_top_node_line("firefly   580m   7%   2500Mi   31%");
        assert_eq!(cpu, 580);
        assert_eq!(mem, 2500 * 1024);
    }

    #[test]
    fn parse_top_node_line_legacy_three_columns() {
        let (cpu, mem) = parse_top_node_line("node-1 120m 512Mi");
        assert_eq!(cpu, 120);
        assert_eq!(mem, 512 * 1024);
    }

    #[test]
    fn parse_top_node_line_memory_bytes() {
        let (cpu, mem) = parse_top_node_line("node-1 580m 2758909952");
        assert_eq!(cpu, 580);
        assert_eq!(mem, 2758909952 / 1024);
    }

    #[test]
    fn parse_memory_ki_units() {
        assert_eq!(parse_memory_ki("2500Mi"), 2500 * 1024);
        assert_eq!(parse_memory_ki("2Gi"), 2 * 1024 * 1024);
    }

    #[test]
    fn with_request_timeout_appends_flag() {
        let args = with_request_timeout(vec!["get".into(), "nodes".into()], 15);
        assert_eq!(args.last().map(String::as_str), Some("--request-timeout=15s"));
    }
}

use std::collections::HashMap;

use anyhow::{anyhow, Result};
use serde_json::Value;

use crate::session::SessionManager;

use super::exec::run_kubectl;
use super::summary::{
    format_cpu_milli, format_memory_ki, parse_cpu_milli, parse_memory_ki, top_nodes_by_name,
};
use super::{K8sClusterTarget, K8sResourceRow};

#[derive(Default)]
struct AllocatedTotals {
    cpu_milli: u64,
    cpu_limits_milli: u64,
    memory_ki: u64,
    memory_limits_ki: u64,
    disk_ki: u64,
    disk_limits_ki: u64,
}

pub async fn enrich_node_rows(
    target: &K8sClusterTarget,
    rows: &mut [K8sResourceRow],
    node_items: &[Value],
    sessions: &SessionManager,
) -> Result<()> {
    let top = top_nodes_by_name(target, sessions).await.unwrap_or_default();
    let allocated = fetch_pod_allocation_by_node(target, sessions)
        .await
        .unwrap_or_default();

    for row in rows.iter_mut() {
        if row.kind != "Node" {
            continue;
        }
        if let Some(item) = node_items
            .iter()
            .find(|i| node_name(i).as_deref() == Some(row.name.as_str()))
        {
            apply_node_meta(row, item);
        }
        if let Some((cpu, mem)) = top.get(&row.name) {
            row.cpu = cpu.clone();
            row.memory = mem.clone();
        }
        if let Some(alloc) = allocated.get(&row.name) {
            if alloc.cpu_milli > 0 {
                row.cpu_requests = Some(format_cpu_milli(alloc.cpu_milli));
            }
            if alloc.cpu_limits_milli > 0 {
                row.cpu_limits = Some(format_cpu_milli(alloc.cpu_limits_milli));
            }
            if alloc.memory_ki > 0 {
                row.memory_requests = Some(format_memory_ki(alloc.memory_ki));
            }
            if alloc.memory_limits_ki > 0 {
                row.memory_limits = Some(format_memory_ki(alloc.memory_limits_ki));
            }
            if alloc.disk_ki > 0 {
                row.disk_requests = Some(format_memory_ki(alloc.disk_ki));
            }
            if alloc.disk_limits_ki > 0 {
                row.disk_limits = Some(format_memory_ki(alloc.disk_limits_ki));
            }
        }
    }
    Ok(())
}

fn node_name(item: &Value) -> Option<String> {
    item.get("metadata")
        .and_then(|m| m.get("name"))
        .and_then(|n| n.as_str())
        .map(String::from)
}

fn apply_node_meta(row: &mut K8sResourceRow, item: &Value) {
    row.roles = extract_node_roles(item);
    row.version = item
        .get("status")
        .and_then(|s| s.get("nodeInfo"))
        .and_then(|n| n.get("kubeletVersion"))
        .and_then(|v| v.as_str())
        .map(String::from);
    row.taints = item
        .get("spec")
        .and_then(|s| s.get("taints"))
        .and_then(|t| t.as_array())
        .map(|a| a.len() as u32);
    row.unschedulable = item
        .get("spec")
        .and_then(|s| s.get("unschedulable"))
        .and_then(|v| v.as_bool());

    if let Some(alloc) = item
        .get("status")
        .and_then(|s| s.get("allocatable"))
        .or_else(|| item.get("status").and_then(|s| s.get("capacity")))
    {
        if let Some(cpu) = alloc.get("cpu").and_then(|x| x.as_str()) {
            let milli = parse_cpu_milli(cpu);
            if milli > 0 {
                row.cpu_capacity = Some(format_cpu_milli(milli));
            }
        }
        if let Some(mem) = alloc.get("memory").and_then(|x| x.as_str()) {
            let ki = parse_memory_ki(mem);
            if ki > 0 {
                row.memory_capacity = Some(format_memory_ki(ki));
            }
        }
        if let Some(disk) = alloc.get("ephemeral-storage").and_then(|x| x.as_str()) {
            let ki = parse_memory_ki(disk);
            if ki > 0 {
                row.disk_capacity = Some(format_memory_ki(ki));
            }
        }
    }
}

fn extract_node_roles(item: &Value) -> Option<String> {
    let labels = item.get("metadata").and_then(|m| m.get("labels"))?;
    let mut roles: Vec<&str> = Vec::new();
    if let Some(obj) = labels.as_object() {
        for key in obj.keys() {
            if let Some(role) = key.strip_prefix("node-role.kubernetes.io/") {
                if !role.is_empty() {
                    roles.push(role);
                }
            } else if key == "kubernetes.io/role" {
                if let Some(v) = obj.get(key).and_then(|x| x.as_str()) {
                    roles.push(v);
                }
            }
        }
    }
    if roles.is_empty() {
        None
    } else {
        roles.sort_unstable();
        roles.dedup();
        Some(roles.join(","))
    }
}

async fn fetch_pod_allocation_by_node(
    target: &K8sClusterTarget,
    sessions: &SessionManager,
) -> Result<HashMap<String, AllocatedTotals>> {
    let result = run_kubectl(
        target,
        &["get".into(), "pods".into(), "-A".into(), "-o".into(), "json".into()],
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
    let mut out: HashMap<String, AllocatedTotals> = HashMap::new();
    for item in items {
        let phase = item
            .get("status")
            .and_then(|s| s.get("phase"))
            .and_then(|p| p.as_str())
            .unwrap_or("");
        if phase == "Succeeded" || phase == "Failed" {
            continue;
        }
        let node = item
            .get("spec")
            .and_then(|s| s.get("nodeName"))
            .and_then(|n| n.as_str())
            .unwrap_or("");
        if node.is_empty() {
            continue;
        }
        let entry = out.entry(node.to_string()).or_default();
        accumulate_pod_resources(&item, entry);
    }
    Ok(out)
}

fn accumulate_pod_resources(item: &Value, totals: &mut AllocatedTotals) {
    let spec = match item.get("spec") {
        Some(s) => s,
        None => return,
    };
    for key in ["containers", "initContainers"] {
        if let Some(arr) = spec.get(key).and_then(|c| c.as_array()) {
            for container in arr {
                let resources = container.get("resources").unwrap_or(&Value::Null);
                add_resource_qty(
                    totals,
                    resources.get("requests").unwrap_or(&Value::Null),
                    resources.get("limits").unwrap_or(&Value::Null),
                );
            }
        }
    }
}

fn add_resource_qty(totals: &mut AllocatedTotals, requests: &Value, limits: &Value) {
    if let Some(cpu) = requests.get("cpu").and_then(|x| x.as_str()) {
        totals.cpu_milli = totals.cpu_milli.saturating_add(parse_cpu_milli(cpu));
    }
    if let Some(cpu) = limits.get("cpu").and_then(|x| x.as_str()) {
        totals.cpu_limits_milli = totals.cpu_limits_milli.saturating_add(parse_cpu_milli(cpu));
    }
    if let Some(mem) = requests.get("memory").and_then(|x| x.as_str()) {
        totals.memory_ki = totals.memory_ki.saturating_add(parse_memory_ki(mem));
    }
    if let Some(mem) = limits.get("memory").and_then(|x| x.as_str()) {
        totals.memory_limits_ki = totals.memory_limits_ki.saturating_add(parse_memory_ki(mem));
    }
    if let Some(disk) = requests.get("ephemeral-storage").and_then(|x| x.as_str()) {
        totals.disk_ki = totals.disk_ki.saturating_add(parse_memory_ki(disk));
    }
    if let Some(disk) = limits.get("ephemeral-storage").and_then(|x| x.as_str()) {
        totals.disk_limits_ki = totals.disk_limits_ki.saturating_add(parse_memory_ki(disk));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_container_resources() {
        let mut totals = AllocatedTotals::default();
        let req = serde_json::json!({"cpu": "100m", "memory": "128Mi", "ephemeral-storage": "1Gi"});
        let lim = serde_json::json!({"cpu": "200m", "memory": "256Mi", "ephemeral-storage": "2Gi"});
        add_resource_qty(&mut totals, &req, &lim);
        assert_eq!(totals.cpu_milli, 100);
        assert_eq!(totals.cpu_limits_milli, 200);
        assert_eq!(totals.memory_ki, 128 * 1024);
        assert_eq!(totals.disk_ki, 1024 * 1024);
    }
}

use anyhow::{anyhow, Result};
use serde_json::Value;

use crate::session::SessionManager;

use super::bindings::overview_from_json;
use super::exec::run_kubectl;
use super::summary::{format_age, merge_top_into_rows, top_pods};
use super::{K8sClusterTarget, K8sResourceDetail, K8sResourceRow, KubectlResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResourceCategory {
    Nodes,
    Namespaces,
    Pods,
    Deployments,
    StatefulSets,
    DaemonSets,
    ReplicaSets,
    Jobs,
    CronJobs,
    HorizontalPodAutoscalers,
    Services,
    Ingresses,
    NetworkPolicies,
    Endpoints,
    ConfigMaps,
    Secrets,
    ResourceQuotas,
    LimitRanges,
    PersistentVolumeClaims,
    PersistentVolumes,
    StorageClasses,
    ServiceAccounts,
    Roles,
    RoleBindings,
    ClusterRoles,
    ClusterRoleBindings,
    Events,
    CustomResourceDefinitions,
}

impl ResourceCategory {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "nodes" => Some(Self::Nodes),
            "namespaces" => Some(Self::Namespaces),
            "pods" => Some(Self::Pods),
            "deployments" => Some(Self::Deployments),
            "statefulsets" => Some(Self::StatefulSets),
            "daemonsets" => Some(Self::DaemonSets),
            "replicasets" => Some(Self::ReplicaSets),
            "jobs" => Some(Self::Jobs),
            "cronjobs" => Some(Self::CronJobs),
            "horizontalpodautoscalers" | "hpa" => Some(Self::HorizontalPodAutoscalers),
            "services" => Some(Self::Services),
            "ingresses" => Some(Self::Ingresses),
            "networkpolicies" => Some(Self::NetworkPolicies),
            "endpoints" => Some(Self::Endpoints),
            "configmaps" => Some(Self::ConfigMaps),
            "secrets" => Some(Self::Secrets),
            "resourcequotas" => Some(Self::ResourceQuotas),
            "limitranges" => Some(Self::LimitRanges),
            "persistentvolumeclaims" | "pvc" => Some(Self::PersistentVolumeClaims),
            "persistentvolumes" | "pv" => Some(Self::PersistentVolumes),
            "storageclasses" => Some(Self::StorageClasses),
            "serviceaccounts" => Some(Self::ServiceAccounts),
            "roles" => Some(Self::Roles),
            "rolebindings" => Some(Self::RoleBindings),
            "clusterroles" => Some(Self::ClusterRoles),
            "clusterrolebindings" => Some(Self::ClusterRoleBindings),
            "events" => Some(Self::Events),
            "customresourcedefinitions" | "crds" => Some(Self::CustomResourceDefinitions),
            _ => None,
        }
    }

    fn kubectl_kind(&self) -> &'static str {
        match self {
            Self::Nodes => "nodes",
            Self::Namespaces => "namespaces",
            Self::Pods => "pods",
            Self::Deployments => "deployments",
            Self::StatefulSets => "statefulsets",
            Self::DaemonSets => "daemonsets",
            Self::ReplicaSets => "replicasets",
            Self::Jobs => "jobs",
            Self::CronJobs => "cronjobs",
            Self::HorizontalPodAutoscalers => "horizontalpodautoscalers",
            Self::Services => "services",
            Self::Ingresses => "ingress",
            Self::NetworkPolicies => "networkpolicies",
            Self::Endpoints => "endpoints",
            Self::ConfigMaps => "configmaps",
            Self::Secrets => "secrets",
            Self::ResourceQuotas => "resourcequotas",
            Self::LimitRanges => "limitranges",
            Self::PersistentVolumeClaims => "persistentvolumeclaims",
            Self::PersistentVolumes => "persistentvolumes",
            Self::StorageClasses => "storageclasses",
            Self::ServiceAccounts => "serviceaccounts",
            Self::Roles => "roles",
            Self::RoleBindings => "rolebindings",
            Self::ClusterRoles => "clusterroles",
            Self::ClusterRoleBindings => "clusterrolebindings",
            Self::Events => "events",
            Self::CustomResourceDefinitions => "customresourcedefinitions",
        }
    }

    fn row_kind(&self) -> &'static str {
        match self {
            Self::Nodes => "Node",
            Self::Namespaces => "Namespace",
            Self::Pods => "Pod",
            Self::Deployments => "Deployment",
            Self::StatefulSets => "StatefulSet",
            Self::DaemonSets => "DaemonSet",
            Self::ReplicaSets => "ReplicaSet",
            Self::Jobs => "Job",
            Self::CronJobs => "CronJob",
            Self::HorizontalPodAutoscalers => "HorizontalPodAutoscaler",
            Self::Services => "Service",
            Self::Ingresses => "Ingress",
            Self::NetworkPolicies => "NetworkPolicy",
            Self::Endpoints => "Endpoints",
            Self::ConfigMaps => "ConfigMap",
            Self::Secrets => "Secret",
            Self::ResourceQuotas => "ResourceQuota",
            Self::LimitRanges => "LimitRange",
            Self::PersistentVolumeClaims => "PersistentVolumeClaim",
            Self::PersistentVolumes => "PersistentVolume",
            Self::StorageClasses => "StorageClass",
            Self::ServiceAccounts => "ServiceAccount",
            Self::Roles => "Role",
            Self::RoleBindings => "RoleBinding",
            Self::ClusterRoles => "ClusterRole",
            Self::ClusterRoleBindings => "ClusterRoleBinding",
            Self::Events => "Event",
            Self::CustomResourceDefinitions => "CustomResourceDefinition",
        }
    }

    fn is_cluster_scoped(&self) -> bool {
        matches!(
            self,
            Self::Nodes
                | Self::Namespaces
                | Self::PersistentVolumes
                | Self::StorageClasses
                | Self::ClusterRoles
                | Self::ClusterRoleBindings
                | Self::CustomResourceDefinitions
        )
    }
}

pub async fn list_resources(
    target: &K8sClusterTarget,
    category: ResourceCategory,
    namespace: Option<&str>,
    sessions: &SessionManager,
) -> Result<Vec<K8sResourceRow>> {
    let kind = category.kubectl_kind();
    let mut args = vec!["get".into(), kind.into(), "-o".into(), "json".into()];
    if !category.is_cluster_scoped() {
        if let Some(ns) = namespace.filter(|s| !s.is_empty() && *s != "*") {
            args.push("-n".into());
            args.push(ns.to_string());
        } else {
            args.push("-A".into());
        }
    }
    let result = run_kubectl(target, &args, sessions).await?;
    if !result.ok {
        return Err(anyhow!(
            result.error.unwrap_or_else(|| result.stderr.clone())
        ));
    }
    let mut rows = parse_list_json(&result.stdout, category.row_kind())?;
    if matches!(category, ResourceCategory::Pods) {
        if let Ok(metrics) = top_pods(target, namespace, sessions).await {
            if !metrics.is_empty() {
                merge_top_into_rows(&mut rows, &metrics);
            }
        }
    }
    Ok(rows)
}

fn parse_list_json(stdout: &str, default_kind: &str) -> Result<Vec<K8sResourceRow>> {
    let v: Value = serde_json::from_str(stdout)?;
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
            .unwrap_or(default_kind)
            .to_string();
        let status = extract_status(&item, &kind);
        let age = meta
            .get("creationTimestamp")
            .and_then(|x| x.as_str())
            .map(format_age);
        let extra = extract_extra(&item, &kind);
        let (restarts, node, ready) = extract_pod_deploy_fields(&item, &kind);
        rows.push(K8sResourceRow {
            namespace,
            name,
            kind,
            status,
            age,
            extra,
            restarts,
            node,
            ready,
            cpu: None,
            memory: None,
        });
    }
    rows.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(rows)
}

fn extract_pod_deploy_fields(
    item: &Value,
    kind: &str,
) -> (Option<u32>, Option<String>, Option<String>) {
    match kind {
        "Pod" => {
            let restarts = item
                .get("status")
                .and_then(|s| s.get("containerStatuses"))
                .and_then(|c| c.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|c| c.get("restartCount").and_then(|r| r.as_u64()))
                        .sum::<u64>() as u32
                });
            let node = item
                .get("spec")
                .and_then(|s| s.get("nodeName"))
                .and_then(|n| n.as_str())
                .map(String::from);
            (restarts, node, None)
        }
        "DaemonSet" => {
            let ready = item.get("status").map(|s| {
                let ready_n = s
                    .get("numberReady")
                    .and_then(|r| r.as_u64())
                    .unwrap_or(0);
                let desired = s
                    .get("desiredNumberScheduled")
                    .and_then(|r| r.as_u64())
                    .unwrap_or(ready_n);
                format!("{ready_n}/{desired}")
            });
            (None, None, ready)
        }
        "Deployment" | "StatefulSet" | "ReplicaSet" => {
            let ready = item.get("status").and_then(|s| {
                let ready_replicas = s.get("readyReplicas").and_then(|r| r.as_u64()).unwrap_or(0);
                let desired = item
                    .get("spec")
                    .and_then(|sp| sp.get("replicas"))
                    .and_then(|r| r.as_u64())
                    .or_else(|| s.get("replicas").and_then(|r| r.as_u64()))
                    .unwrap_or(ready_replicas);
                Some(format!("{ready_replicas}/{desired}"))
            });
            (None, None, ready)
        }
        _ => (None, None, None),
    }
}

fn extract_extra(item: &Value, kind: &str) -> Option<String> {
    match kind {
        "Node" => {
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
        "CustomResourceDefinition" => item
            .get("spec")
            .and_then(|s| s.get("group"))
            .and_then(|g| g.as_str())
            .map(|g| {
                let plural = item
                    .get("spec")
                    .and_then(|s| s.get("names"))
                    .and_then(|n| n.get("plural"))
                    .and_then(|p| p.as_str())
                    .unwrap_or("");
                format!("{plural}.{g}")
            }),
        "Service" => {
            let ports = item
                .get("spec")
                .and_then(|s| s.get("ports"))
                .and_then(|p| p.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|p| {
                            let port = p.get("port").and_then(|x| x.as_u64())?;
                            let proto = p
                                .get("protocol")
                                .and_then(|x| x.as_str())
                                .unwrap_or("TCP");
                            Some(format!("{port}/{proto}"))
                        })
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .filter(|s| !s.is_empty());
            ports
        }
        "PersistentVolumeClaim" => {
            let capacity = item
                .get("status")
                .and_then(|s| s.get("capacity"))
                .and_then(|c| c.get("storage"))
                .and_then(|s| s.as_str())
                .or_else(|| {
                    item.get("spec")
                        .and_then(|s| s.get("resources"))
                        .and_then(|r| r.get("requests"))
                        .and_then(|r| r.get("storage"))
                        .and_then(|s| s.as_str())
                });
            let sc = item
                .get("spec")
                .and_then(|s| s.get("storageClassName"))
                .and_then(|s| s.as_str());
            match (capacity, sc) {
                (Some(c), Some(s)) => Some(format!("{c} · {s}")),
                (Some(c), None) => Some(c.to_string()),
                (None, Some(s)) => Some(s.to_string()),
                _ => None,
            }
        }
        "Event" => {
            let obj = item.get("involvedObject").or_else(|| item.get("regarding"));
            let kind = obj
                .and_then(|o| o.get("kind"))
                .and_then(|k| k.as_str())
                .unwrap_or("");
            let name = obj
                .and_then(|o| o.get("name"))
                .and_then(|n| n.as_str())
                .unwrap_or("");
            let msg = item
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("")
                .chars()
                .take(80)
                .collect::<String>();
            let target = if kind.is_empty() && name.is_empty() {
                String::new()
            } else if name.is_empty() {
                kind.to_string()
            } else {
                format!("{kind}/{name}")
            };
            if target.is_empty() && msg.is_empty() {
                None
            } else if msg.is_empty() {
                Some(target)
            } else if target.is_empty() {
                Some(msg)
            } else {
                Some(format!("{target} — {msg}"))
            }
        }
        _ => None,
    }
}

fn extract_status(item: &Value, kind: &str) -> Option<String> {
    match kind {
        "Pod" => item
            .get("status")
            .and_then(|s| s.get("phase"))
            .and_then(|v| v.as_str())
            .map(String::from),
        "Node" => item
            .get("status")
            .and_then(|s| s.get("conditions"))
            .and_then(|c| c.as_array())
            .and_then(|arr| {
                arr.iter()
                    .find(|x| x.get("type").and_then(|t| t.as_str()) == Some("Ready"))
                    .and_then(|x| x.get("status").and_then(|s| s.as_str()))
                    .map(|s| {
                        if s.eq_ignore_ascii_case("True") {
                            "Ready".to_string()
                        } else {
                            "NotReady".to_string()
                        }
                    })
            }),
        "Namespace" => item
            .get("status")
            .and_then(|s| s.get("phase"))
            .and_then(|v| v.as_str())
            .map(String::from),
        "DaemonSet" => item.get("status").map(|s| {
            let ready_n = s
                .get("numberReady")
                .and_then(|r| r.as_u64())
                .unwrap_or(0);
            let desired = s
                .get("desiredNumberScheduled")
                .and_then(|r| r.as_u64())
                .unwrap_or(ready_n);
            if ready_n >= desired && desired > 0 {
                "Ready".to_string()
            } else {
                format!("{ready_n}/{desired} ready")
            }
        }),
        "Deployment" | "StatefulSet" | "ReplicaSet" => item
            .get("status")
            .and_then(|s| s.get("conditions"))
            .and_then(|c| c.as_array())
            .and_then(|arr| {
                let available = arr.iter().find(|x| {
                    x.get("type").and_then(|t| t.as_str()) == Some("Available")
                });
                let progressing = arr.iter().find(|x| {
                    x.get("type").and_then(|t| t.as_str()) == Some("Progressing")
                });
                if let Some(a) = available {
                    let status = a.get("status").and_then(|s| s.as_str()).unwrap_or("");
                    if status.eq_ignore_ascii_case("True") {
                        return Some("Available".to_string());
                    }
                    if let Some(reason) = a.get("reason").and_then(|r| r.as_str()) {
                        return Some(reason.to_string());
                    }
                    return Some("Unavailable".to_string());
                }
                progressing.and_then(|p| {
                    p.get("reason")
                        .and_then(|r| r.as_str())
                        .map(String::from)
                        .or_else(|| {
                            p.get("status")
                                .and_then(|s| s.as_str())
                                .map(|s| format!("Progressing={s}"))
                        })
                })
            }),
        "Service" => item
            .get("spec")
            .and_then(|s| s.get("type"))
            .and_then(|t| t.as_str())
            .map(String::from),
        "PersistentVolumeClaim" | "PersistentVolume" => item
            .get("status")
            .and_then(|s| s.get("phase"))
            .and_then(|v| v.as_str())
            .map(String::from),
        "Event" => item
            .get("reason")
            .and_then(|r| r.as_str())
            .map(String::from)
            .or_else(|| {
                item.get("type")
                    .and_then(|t| t.as_str())
                    .map(String::from)
            }),
        "Job" => item.get("status").and_then(|s| {
            let succeeded = s.get("succeeded").and_then(|x| x.as_u64()).unwrap_or(0);
            let failed = s.get("failed").and_then(|x| x.as_u64()).unwrap_or(0);
            let active = s.get("active").and_then(|x| x.as_u64()).unwrap_or(0);
            let completions = item
                .get("spec")
                .and_then(|sp| sp.get("completions"))
                .and_then(|c| c.as_u64())
                .unwrap_or(1);
            if failed > 0 {
                Some(format!("Failed {failed}"))
            } else if succeeded >= completions {
                Some("Complete".to_string())
            } else if active > 0 {
                Some(format!("Active {active}"))
            } else {
                Some(format!("{succeeded}/{completions}"))
            }
        }),
        _ => None,
    }
}

pub async fn get_resource(
    target: &K8sClusterTarget,
    kind: &str,
    namespace: &str,
    name: &str,
    sessions: &SessionManager,
) -> Result<K8sResourceDetail> {
    let kind_arg = kubectl_get_kind(kind);
    let cluster_scoped = is_cluster_scoped_kind(kind);
    let mut args = vec![
        "get".into(),
        kind_arg.into(),
        name.into(),
        "-o".into(),
        "json".into(),
    ];
    if !namespace.is_empty() && !cluster_scoped {
        args.push("-n".into());
        args.push(namespace.into());
    }
    let json_result = run_kubectl(target, &args, sessions).await?;
    if !json_result.ok {
        return Err(anyhow!(
            json_result
                .error
                .unwrap_or_else(|| json_result.stderr.clone())
        ));
    }
    let value: Value = serde_json::from_str(&json_result.stdout)?;
    let overview = overview_from_json(kind, &value);

    let mut yaml_args = vec![
        "get".into(),
        kind_arg.into(),
        name.into(),
        "-o".into(),
        "yaml".into(),
    ];
    if !namespace.is_empty() && !cluster_scoped {
        yaml_args.push("-n".into());
        yaml_args.push(namespace.into());
    }
    let yaml_result = run_kubectl(target, &yaml_args, sessions).await?;
    let yaml = if yaml_result.ok {
        yaml_result.stdout
    } else {
        json_result.stdout
    };

    Ok(K8sResourceDetail {
        kind: kind.to_string(),
        namespace: namespace.to_string(),
        name: name.to_string(),
        yaml,
        overview,
    })
}

fn kubectl_get_kind(kind: &str) -> &str {
    match kind {
        "Ingress" => "ingress",
        "Endpoints" => "endpoints",
        "HorizontalPodAutoscaler" => "hpa",
        "PersistentVolumeClaim" => "pvc",
        "PersistentVolume" => "pv",
        "CustomResourceDefinition" => "crd",
        other => other,
    }
}

fn is_cluster_scoped_kind(kind: &str) -> bool {
    matches!(
        kind,
        "Node"
            | "Namespace"
            | "PersistentVolume"
            | "StorageClass"
            | "ClusterRole"
            | "ClusterRoleBinding"
            | "CustomResourceDefinition"
    )
}

pub async fn apply_yaml(
    target: &K8sClusterTarget,
    yaml: &str,
    sessions: &SessionManager,
) -> Result<KubectlResult> {
    let tmp = std::env::temp_dir().join(format!("tw-k8s-apply-{}.yaml", uuid::Uuid::new_v4()));
    std::fs::write(&tmp, yaml)?;
    let path = tmp.to_string_lossy().to_string();
    let result = run_kubectl(
        target,
        &["apply".into(), "-f".into(), path.clone()],
        sessions,
    )
    .await;
    let _ = std::fs::remove_file(&tmp);
    result
}

pub async fn delete_resource(
    target: &K8sClusterTarget,
    kind: &str,
    namespace: &str,
    name: &str,
    sessions: &SessionManager,
) -> Result<KubectlResult> {
    let kind_arg = kubectl_get_kind(kind);
    let mut args = vec!["delete".into(), kind_arg.into(), name.into()];
    if !namespace.is_empty() && !is_cluster_scoped_kind(kind) {
        args.push("-n".into());
        args.push(namespace.into());
    }
    run_kubectl(target, &args, sessions).await
}

pub async fn scale_resource(
    target: &K8sClusterTarget,
    kind: &str,
    namespace: &str,
    name: &str,
    replicas: i32,
    sessions: &SessionManager,
) -> Result<KubectlResult> {
    let mut args = vec![
        "scale".into(),
        format!("{}/{}", kind.to_lowercase(), name),
        format!("--replicas={replicas}"),
    ];
    if !namespace.is_empty() {
        args.push("-n".into());
        args.push(namespace.into());
    }
    run_kubectl(target, &args, sessions).await
}

pub async fn pod_logs(
    target: &K8sClusterTarget,
    namespace: &str,
    pod: &str,
    container: Option<&str>,
    tail_lines: u32,
    sessions: &SessionManager,
) -> Result<String> {
    let mut args = vec![
        "logs".into(),
        pod.into(),
        "-n".into(),
        namespace.into(),
        format!("--tail={tail_lines}"),
    ];
    if let Some(c) = container.filter(|s| !s.is_empty()) {
        args.push("-c".into());
        args.push(c.to_string());
    }
    let result = run_kubectl(target, &args, sessions).await?;
    if result.ok {
        Ok(result.stdout)
    } else {
        Err(anyhow!(result.error.unwrap_or(result.stderr)))
    }
}

pub async fn pod_containers(
    target: &K8sClusterTarget,
    namespace: &str,
    pod: &str,
    sessions: &SessionManager,
) -> Result<Vec<String>> {
    let mut args = vec![
        "get".into(),
        "pod".into(),
        pod.into(),
        "-n".into(),
        namespace.into(),
        "-o".into(),
        "json".into(),
    ];
    let _ = &mut args;
    let result = run_kubectl(target, &args, sessions).await?;
    if !result.ok {
        return Err(anyhow!(
            result.error.unwrap_or_else(|| result.stderr.clone())
        ));
    }
    let v: Value = serde_json::from_str(&result.stdout)?;
    let mut names = Vec::new();
    if let Some(containers) = v
        .get("spec")
        .and_then(|s| s.get("containers"))
        .and_then(|c| c.as_array())
    {
        for c in containers {
            if let Some(n) = c.get("name").and_then(|x| x.as_str()) {
                names.push(n.to_string());
            }
        }
    }
    Ok(names)
}

pub async fn list_namespaces(
    target: &K8sClusterTarget,
    sessions: &SessionManager,
) -> Result<Vec<String>> {
    let result = run_kubectl(
        target,
        &["get".into(), "namespaces".into(), "-o".into(), "json".into()],
        sessions,
    )
    .await?;
    if !result.ok {
        return Err(anyhow!(
            result.error.unwrap_or_else(|| result.stderr.clone())
        ));
    }
    let Some(parsed) = result.parsed else {
        return Ok(vec![]);
    };
    let items = parsed
        .get("items")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut names: Vec<String> = items
        .iter()
        .filter_map(|item| {
            item.get("metadata")
                .and_then(|m| m.get("name"))
                .and_then(|n| n.as_str())
                .map(|s| s.to_string())
        })
        .collect();
    names.sort();
    Ok(names)
}

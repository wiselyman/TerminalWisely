//! Kubernetes operations: local kubeconfig + SSH kubectl.

pub mod bindings;
pub mod exec;
pub mod helm;
pub mod kubeconfig;
pub mod portforward;
pub mod resources;
pub mod shell;
pub mod summary;
pub mod tools;

pub use bindings::*;
pub use exec::*;
pub use helm::*;
pub use kubeconfig::*;
pub use portforward::*;
pub use resources::{
    apply_yaml, delete_resource, get_resource, list_namespaces, list_resources, pod_containers,
    pod_logs, scale_resource, ResourceCategory,
};
pub use shell::{
    pod_shell_input, pod_shell_resize, start_pod_shell, stop_pod_shell, K8sPodShellInfo,
};
pub use summary::{
    cluster_summary, format_age, merge_top_into_rows, top_pods, K8sClusterSummary,
    K8sTopPodRow, K8sWarningEvent,
};
pub use tools::{
    install_tools, resolve_tool, tools_status, tools_status_checked, K8sToolKind, K8sToolsStatus,
};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum K8sClusterKind {
    Kubeconfig,
    SshKubectl,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sClusterTarget {
    pub id: String,
    pub kind: K8sClusterKind,
    pub display_name: String,
    pub context: Option<String>,
    /// Absolute path when using a non-default / imported kubeconfig.
    #[serde(default)]
    pub kubeconfig_path: Option<String>,
    pub session_id: Option<String>,
    pub server_id: Option<String>,
    pub namespace: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sContextInfo {
    pub name: String,
    pub cluster: Option<String>,
    pub user: Option<String>,
    pub current: bool,
    #[serde(default)]
    pub kubeconfig_path: Option<String>,
    /// "default" | "imported"
    #[serde(default = "default_source")]
    pub source: String,
    /// User-facing label (alias or context name).
    #[serde(default)]
    pub display_name: Option<String>,
}

fn default_source() -> String {
    "default".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KubectlResult {
    pub ok: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub parsed: Option<serde_json::Value>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sResourceRow {
    pub namespace: String,
    pub name: String,
    pub kind: String,
    pub status: Option<String>,
    pub age: Option<String>,
    pub extra: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub restarts: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ready: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cpu: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub memory: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sResourceDetail {
    pub kind: String,
    pub namespace: String,
    pub name: String,
    pub yaml: String,
    pub overview: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshBindingInput {
    pub display_name: String,
    pub session_id: String,
    pub server_id: Option<String>,
    pub namespace: Option<String>,
}

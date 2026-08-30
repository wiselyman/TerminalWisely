//! Live K8s checks against k3d (feature `integration-tests`).
//! Run via `scripts/e2e-k8s-integration.sh` with `TW_K8S_E2E=1`.

#![cfg(feature = "integration-tests")]

#[cfg(test)]
mod tests {
    use crate::k8s::{
        discover_contexts, list_namespaces, list_resources, K8sClusterKind, K8sClusterTarget,
        ResourceCategory,
    };
    use crate::session::SessionManager;

    fn live_enabled() -> bool {
        std::env::var("TW_K8S_E2E").ok().as_deref() == Some("1")
    }

    fn live_target() -> Option<K8sClusterTarget> {
        if !live_enabled() {
            return None;
        }

        let kubeconfig = std::env::var("KUBECONFIG").ok();
        let context = std::env::var("TW_K8S_E2E_CONTEXT").ok();
        let namespace =
            std::env::var("TW_K8S_E2E_NAMESPACE").unwrap_or_else(|_| "default".into());

        Some(K8sClusterTarget {
            id: format!("kube:{}", context.clone().unwrap_or_else(|| "default".into())),
            kind: K8sClusterKind::Kubeconfig,
            display_name: "tw-live-k8s".into(),
            context,
            kubeconfig_path: kubeconfig,
            session_id: None,
            server_id: None,
            namespace,
        })
    }

    #[test]
    fn live_discover_contexts() {
        if !live_enabled() {
            return;
        }

        let contexts = discover_contexts().expect("discover contexts");
        assert!(!contexts.is_empty(), "expected at least one kube context");
    }

    #[tokio::test]
    async fn live_list_namespaces() {
        let Some(target) = live_target() else {
            return;
        };

        let namespaces = list_namespaces(&target, &SessionManager::new())
            .await
            .expect("list namespaces");
        assert!(
            namespaces.iter().any(|ns| ns == "default"),
            "expected default namespace, got {namespaces:?}",
        );
    }

    #[tokio::test]
    async fn live_list_pods_in_namespace() {
        let Some(target) = live_target() else {
            return;
        };

        let pod_name =
            std::env::var("TW_K8S_E2E_POD").unwrap_or_else(|_| "tw-e2e-nginx".into());
        let sessions = SessionManager::new();
        let rows = list_resources(
            &target,
            ResourceCategory::Pods,
            Some(target.namespace.as_str()),
            &sessions,
        )
        .await
        .expect("list pods");

        assert!(
            rows.iter().any(|row| row.name == pod_name),
            "expected pod {pod_name}, got {:?}",
            rows.iter().map(|r| r.name.clone()).collect::<Vec<_>>(),
        );
    }
}

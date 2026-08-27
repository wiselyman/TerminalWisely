/** K8s cluster target — local kubeconfig context or SSH kubectl jump host. */

export type K8sClusterKind = "kubeconfig" | "ssh_kubectl";

export interface K8sClusterTarget {
  id: string;
  kind: K8sClusterKind;
  display_name: string;
  /** kubeconfig context name (local). */
  context?: string | null;
  /** Absolute kubeconfig path when imported / non-default. */
  kubeconfig_path?: string | null;
  /** "default" | "imported" for kubeconfig clusters. */
  source?: string | null;
  /** SSH session id when kind=ssh_kubectl. */
  session_id?: string | null;
  /** Stable host identity for bookmarks. */
  server_id?: string | null;
  namespace: string;
}

export type K8sResourceCategory =
  | "cluster_overview"
  | "nodes"
  | "namespaces"
  | "pods"
  | "deployments"
  | "statefulsets"
  | "daemonsets"
  | "replicasets"
  | "jobs"
  | "cronjobs"
  | "horizontalpodautoscalers"
  | "services"
  | "ingresses"
  | "networkpolicies"
  | "endpoints"
  | "configmaps"
  | "secrets"
  | "resourcequotas"
  | "limitranges"
  | "persistentvolumeclaims"
  | "persistentvolumes"
  | "storageclasses"
  | "serviceaccounts"
  | "roles"
  | "rolebindings"
  | "clusterroles"
  | "clusterrolebindings"
  | "events"
  | "customresourcedefinitions"
  | "helm_releases";

export interface K8sResourceRow {
  namespace: string;
  name: string;
  kind: string;
  status?: string | null;
  age?: string | null;
  extra?: string | null;
  restarts?: number | null;
  node?: string | null;
  ready?: string | null;
  cpu?: string | null;
  memory?: string | null;
}

export interface K8sResourceDetail {
  kind: string;
  namespace: string;
  name: string;
  yaml: string;
  overview: Record<string, string>;
}

export interface K8sContextInfo {
  name: string;
  cluster?: string | null;
  user?: string | null;
  current: boolean;
  kubeconfig_path?: string | null;
  /** "default" | "imported" */
  source?: string;
  /** User-facing label (alias or context name). */
  display_name?: string | null;
}

export interface PortForwardInfo {
  id: string;
  cluster_id: string;
  resource_kind: string;
  namespace: string;
  name: string;
  local_port: number;
  remote_port: number;
  mode: string;
}

export interface HelmReleaseRow {
  name: string;
  namespace: string;
  revision: string;
  status: string;
  chart: string;
  app_version: string;
  updated?: string | null;
}

export interface K8sWarningEvent {
  namespace: string;
  name: string;
  kind: string;
  reason: string;
  message: string;
  age?: string | null;
}

export interface K8sClusterSummary {
  version?: string | null;
  node_count: number;
  pod_counts: Record<string, number>;
  recent_warnings: K8sWarningEvent[];
}

export interface K8sTopPodRow {
  namespace: string;
  name: string;
  cpu?: string | null;
  memory?: string | null;
}

export interface K8sPodShellInfo {
  id: string;
  namespace: string;
  pod: string;
}

export type K8sSortField = "name" | "namespace" | "age" | "status";
export type K8sSortDir = "asc" | "desc";

export interface K8sCrdBrowseContext {
  plural: string;
  group: string;
  crdName: string;
}

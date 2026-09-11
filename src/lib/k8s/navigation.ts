import type { K8sResourceCategory } from "./types";

/** Map Kubernetes kind → workbench resource category. */
const KIND_TO_CATEGORY: Record<string, K8sResourceCategory> = {
  Node: "nodes",
  Namespace: "namespaces",
  Application: "applications",
  Pod: "pods",
  Deployment: "deployments",
  StatefulSet: "statefulsets",
  DaemonSet: "daemonsets",
  ReplicaSet: "replicasets",
  ReplicationController: "replicationcontrollers",
  Job: "jobs",
  CronJob: "cronjobs",
  HorizontalPodAutoscaler: "horizontalpodautoscalers",
  Service: "services",
  Ingress: "ingresses",
  IngressClass: "ingressclasses",
  NetworkPolicy: "networkpolicies",
  Endpoints: "endpoints",
  EndpointSlice: "endpointslices",
  ConfigMap: "configmaps",
  Secret: "secrets",
  ResourceQuota: "resourcequotas",
  LimitRange: "limitranges",
  PodDisruptionBudget: "poddisruptionbudgets",
  PriorityClass: "priorityclasses",
  RuntimeClass: "runtimeclasses",
  Lease: "leases",
  MutatingWebhookConfiguration: "mutatingwebhookconfigurations",
  ValidatingWebhookConfiguration: "validatingwebhookconfigurations",
  ValidatingAdmissionPolicy: "validatingadmissionpolicies",
  ValidatingAdmissionPolicyBinding: "validatingadmissionpolicybindings",
  GatewayClass: "gatewayclasses",
  Gateway: "gateways",
  HTTPRoute: "httproutes",
  GRPCRoute: "grpcroutes",
  ReferenceGrant: "referencegrants",
  PersistentVolumeClaim: "persistentvolumeclaims",
  PersistentVolume: "persistentvolumes",
  StorageClass: "storageclasses",
  ServiceAccount: "serviceaccounts",
  Role: "roles",
  RoleBinding: "rolebindings",
  ClusterRole: "clusterroles",
  ClusterRoleBinding: "clusterrolebindings",
  Event: "events",
  CustomResourceDefinition: "customresourcedefinitions",
  HelmRelease: "helm_releases",
  HelmChart: "helm_charts",
};

export function categoryForKind(kind: string): K8sResourceCategory | null {
  const trimmed = kind.trim();
  if (!trimmed) return null;
  return KIND_TO_CATEGORY[trimmed] ?? null;
}

const ALL_NS_KEY = "tw.k8s.allNamespaces";
const SELECTED_NS_KEY = "tw.k8s.selectedNamespaces";

export type ClusterNamespaceSelection = {
  allNamespaces: boolean;
  selectedNamespaces: string[];
  namespace: string;
};

function clusterNamespaceKey(clusterId: string): string {
  return `tw.k8s.nsSelection.${clusterId}`;
}

export function defaultClusterNamespaceSelection(
  fallback = "default",
): ClusterNamespaceSelection {
  return {
    allNamespaces: true,
    selectedNamespaces: [],
    namespace: fallback || "default",
  };
}

/** Per-cluster namespace filter (Lens-style); falls back to All namespaces. */
export function loadClusterNamespaceSelection(
  clusterId: string,
  fallbackNamespace: string,
): ClusterNamespaceSelection {
  try {
    const raw = localStorage.getItem(clusterNamespaceKey(clusterId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ClusterNamespaceSelection>;
      if (typeof parsed.allNamespaces === "boolean") {
        const namespace =
          typeof parsed.namespace === "string" && parsed.namespace.trim()
            ? parsed.namespace.trim()
            : fallbackNamespace || "default";
        const selectedNamespaces = Array.isArray(parsed.selectedNamespaces)
          ? parsed.selectedNamespaces.filter(
              (x): x is string => typeof x === "string" && x.length > 0,
            )
          : [];
        return {
          allNamespaces: parsed.allNamespaces,
          selectedNamespaces,
          namespace,
        };
      }
    }
  } catch {
    /* ignore */
  }
  return defaultClusterNamespaceSelection(fallbackNamespace);
}

export function saveClusterNamespaceSelection(
  clusterId: string,
  selection: ClusterNamespaceSelection,
) {
  try {
    localStorage.setItem(
      clusterNamespaceKey(clusterId),
      JSON.stringify(selection),
    );
  } catch {
    /* ignore */
  }
}

export function loadAllNamespaces(): boolean {
  try {
    return localStorage.getItem(ALL_NS_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveAllNamespaces(all: boolean) {
  try {
    localStorage.setItem(ALL_NS_KEY, all ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function loadSelectedNamespaces(fallback: string): string[] {
  try {
    const raw = localStorage.getItem(SELECTED_NS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every((x) => typeof x === "string")
      ) {
        return parsed as string[];
      }
    }
  } catch {
    /* ignore */
  }
  return [fallback || "default"];
}

export function saveSelectedNamespaces(namespaces: string[]) {
  try {
    localStorage.setItem(SELECTED_NS_KEY, JSON.stringify(namespaces));
  } catch {
    /* ignore */
  }
}

/** Group CRD catalog entries by API group for the Lens-like tree. */
export function groupCrdCatalog(
  entries: import("./types").K8sCrdCatalogEntry[],
): Map<string, import("./types").K8sCrdCatalogEntry[]> {
  const groups = new Map<string, import("./types").K8sCrdCatalogEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.group) ?? [];
    list.push(entry);
    groups.set(entry.group, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.kind.localeCompare(b.kind));
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

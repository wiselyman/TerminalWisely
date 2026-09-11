import type { K8sCrdCatalogEntry, K8sResourceCategory } from "./types";

export const STORAGE_NAV = "tw.k8s.navExpanded";
export const DEFAULT_EXPANDED = ["cluster", "workloads"];

export const OVERVIEW_CATEGORY = "cluster_overview" as const;

export const GATEWAY_API_GROUP = "gateway.networking.k8s.io";

export const GATEWAY_CATEGORIES: K8sResourceCategory[] = [
  "gatewayclasses",
  "gateways",
  "httproutes",
  "grpcroutes",
  "referencegrants",
];

export type K8sNavGroup = {
  id: string;
  items: K8sResourceCategory[];
};

const BASE_NAV_GROUPS: K8sNavGroup[] = [
  {
    id: "cluster",
    items: ["cluster_overview", "namespaces", "nodes"],
  },
  {
    id: "workloads",
    items: [
      "pods",
      "deployments",
      "statefulsets",
      "daemonsets",
      "replicasets",
      "jobs",
      "cronjobs",
    ],
  },
  {
    id: "network",
    items: [
      "services",
      "endpoints",
      "endpointslices",
      "ingresses",
      "ingressclasses",
      "networkpolicies",
      "port_forwards",
    ],
  },
  {
    id: "storage",
    items: ["persistentvolumeclaims", "persistentvolumes", "storageclasses"],
  },
  {
    id: "security",
    items: [
      "serviceaccounts",
      "roles",
      "rolebindings",
      "clusterroles",
      "clusterrolebindings",
    ],
  },
  {
    id: "config",
    items: [
      "configmaps",
      "secrets",
      "horizontalpodautoscalers",
      "poddisruptionbudgets",
      "resourcequotas",
      "limitranges",
      "priorityclasses",
      "runtimeclasses",
      "leases",
      "mutatingwebhookconfigurations",
      "validatingwebhookconfigurations",
    ],
  },
  {
    id: "helm",
    items: ["helm_charts", "helm_releases"],
  },
  {
    id: "custom",
    items: [],
  },
];

const GATEWAY_NAV_GROUP: K8sNavGroup = {
  id: "gateway",
  items: GATEWAY_CATEGORIES,
};

/** Categories hidden from sidebar but still reachable via search / kind mapping. */
export const SIDEBAR_HIDDEN_CATEGORIES = new Set<K8sResourceCategory>([
  "applications",
  "workloads_overview",
  "events",
  "replicationcontrollers",
]);

export const CLUSTER_SCOPED_CATEGORIES = new Set<K8sResourceCategory>([
  "nodes",
  "namespaces",
  "ingressclasses",
  "priorityclasses",
  "runtimeclasses",
  "mutatingwebhookconfigurations",
  "validatingwebhookconfigurations",
  "validatingadmissionpolicies",
  "validatingadmissionpolicybindings",
  "gatewayclasses",
  "gateways",
  "httproutes",
  "grpcroutes",
  "referencegrants",
  "persistentvolumes",
  "storageclasses",
  "clusterroles",
  "clusterrolebindings",
  "customresourcedefinitions",
  "port_forwards",
]);

export function isGatewayNavAvailable(
  catalog: K8sCrdCatalogEntry[],
): boolean {
  return catalog.some(
    (entry) =>
      entry.group === GATEWAY_API_GROUP ||
      entry.name.endsWith(`.${GATEWAY_API_GROUP}`),
  );
}

/** Headlamp-style sidebar groups; gateway is always listed (resources empty if CRDs missing). */
export function buildNavGroups(gatewayAvailable = true): K8sNavGroup[] {
  if (!gatewayAvailable) return [...BASE_NAV_GROUPS];
  const groups = [...BASE_NAV_GROUPS];
  const configIdx = groups.findIndex((g) => g.id === "config");
  const insertAt = configIdx >= 0 ? configIdx : groups.length - 2;
  groups.splice(insertAt, 0, GATEWAY_NAV_GROUP);
  return groups;
}

export function groupIdForCategory(
  category: K8sResourceCategory,
  navGroups: K8sNavGroup[],
): string | null {
  return navGroups.find((g) => g.items.includes(category))?.id ?? null;
}

export function loadExpandedGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_NAV);
    if (!raw) return new Set(DEFAULT_EXPANDED);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set(DEFAULT_EXPANDED);
    const ids = parsed.filter((x): x is string => typeof x === "string");
    const known = new Set(buildNavGroups(true).map((g) => g.id));
    const migrated = ids.filter(
      (id) => (known.has(id) || id === "access") && id !== "overview",
    );
    const normalized = migrated.map((id) => (id === "access" ? "security" : id));
    if (normalized.length === 0) return new Set(DEFAULT_EXPANDED);
    return new Set(normalized);
  } catch {
    return new Set(DEFAULT_EXPANDED);
  }
}

export function saveExpandedGroups(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_NAV, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

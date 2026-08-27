import type { K8sResourceCategory } from "./types";

/** Map Kubernetes kind → workbench resource category. */
const KIND_TO_CATEGORY: Record<string, K8sResourceCategory> = {
  Node: "nodes",
  Namespace: "namespaces",
  Pod: "pods",
  Deployment: "deployments",
  StatefulSet: "statefulsets",
  DaemonSet: "daemonsets",
  ReplicaSet: "replicasets",
  Job: "jobs",
  CronJob: "cronjobs",
  HorizontalPodAutoscaler: "horizontalpodautoscalers",
  Service: "services",
  Ingress: "ingresses",
  NetworkPolicy: "networkpolicies",
  Endpoints: "endpoints",
  ConfigMap: "configmaps",
  Secret: "secrets",
  ResourceQuota: "resourcequotas",
  LimitRange: "limitranges",
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
};

export function categoryForKind(kind: string): K8sResourceCategory | null {
  const trimmed = kind.trim();
  if (!trimmed) return null;
  return KIND_TO_CATEGORY[trimmed] ?? null;
}

export const AUTO_REFRESH_OPTIONS = [0, 15, 30, 60] as const;
export type K8sAutoRefreshSec = (typeof AUTO_REFRESH_OPTIONS)[number];

export function loadAutoRefreshSec(): K8sAutoRefreshSec {
  try {
    const n = Number(localStorage.getItem("tw.k8s.autoRefreshSec"));
    if (AUTO_REFRESH_OPTIONS.includes(n as K8sAutoRefreshSec)) {
      return n as K8sAutoRefreshSec;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

export function saveAutoRefreshSec(sec: K8sAutoRefreshSec) {
  try {
    localStorage.setItem("tw.k8s.autoRefreshSec", String(sec));
  } catch {
    /* ignore */
  }
}

const ALL_NS_KEY = "tw.k8s.allNamespaces";

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

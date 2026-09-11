import {
  parseCpuToMilli,
  parseMemoryToKi,
  usageRatio,
} from "./metricsFormat";
import type { K8sClusterSummary } from "./types";

export type K8sStatusBarTone =
  | ""
  | "is-warn"
  | "is-critical"
  | "is-muted"
  | "is-host";

export type K8sStatusBarChip = {
  id: string;
  label: string;
  title?: string;
  tone: K8sStatusBarTone;
  loading?: boolean;
};

export function buildK8sStatusBarChips(input: {
  clusterName: string | null;
  clusterKind?: string | null;
  clusterId?: string | null;
  summary: K8sClusterSummary | null;
  loading: boolean;
}): K8sStatusBarChip[] {
  const { clusterName, clusterKind, clusterId, summary, loading } = input;
  if (!clusterName?.trim()) {
    return [{ id: "empty", label: "—", tone: "is-muted" }];
  }
  const nameTitle =
    clusterKind?.trim() && clusterId?.trim()
      ? `${clusterKind.trim()} · ${clusterId.trim()}`
      : undefined;
  const chips: K8sStatusBarChip[] = [
    { id: "name", label: clusterName.trim(), tone: "is-host", title: nameTitle },
  ];
  if (loading && !summary) {
    for (const id of ["nodes", "pods", "cpu", "mem", "warnings"] as const) {
      chips.push({ id, label: "…", tone: "is-muted", loading: true });
    }
    return chips;
  }
  if (!summary) {
    chips.push({ id: "nodes", label: "…", tone: "is-muted", loading: true });
    return chips;
  }
  if (summary.version?.trim()) {
    chips.push({
      id: "version",
      label: summary.version.trim(),
      tone: "",
      title: summary.version.trim(),
    });
  }
  const ready = summary.ready_node_count;
  const total = summary.node_count;
  chips.push({
    id: "nodes",
    label: `${ready}/${total}`,
    tone: total > 0 && ready < total ? "is-warn" : "",
  });
  chips.push({
    id: "pods",
    label:
      summary.pod_capacity > 0
        ? `${summary.total_pods}/${summary.pod_capacity}`
        : String(summary.total_pods),
    tone: "",
  });
  const m = summary.metrics;
  if (m?.cpu_usage && m.cpu_capacity) {
    const used = parseCpuToMilli(m.cpu_usage);
    const cap = parseCpuToMilli(m.cpu_capacity);
    if (used != null && cap != null) {
      const ratio = usageRatio(used, cap);
      if (ratio != null) {
        chips.push({
          id: "cpu",
          label: `${Math.round(ratio * 100)}%`,
          tone: ratio >= 0.9 ? "is-critical" : ratio >= 0.75 ? "is-warn" : "",
        });
      }
    }
  }
  if (m?.memory_usage && m.memory_capacity) {
    const used = parseMemoryToKi(m.memory_usage);
    const cap = parseMemoryToKi(m.memory_capacity);
    if (used != null && cap != null) {
      const ratio = usageRatio(used, cap);
      if (ratio != null) {
        chips.push({
          id: "mem",
          label: `${Math.round(ratio * 100)}%`,
          tone: ratio >= 0.9 ? "is-critical" : ratio >= 0.75 ? "is-warn" : "",
        });
      }
    }
  }
  const warnN = summary.recent_warnings.length;
  chips.push({
    id: "warnings",
    label: String(warnN),
    tone: warnN > 0 ? "is-warn" : "",
  });
  return chips;
}

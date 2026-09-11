import { describe, expect, it } from "vitest";
import { buildK8sStatusBarChips } from "./clusterStatusBar";
import type { K8sClusterSummary } from "./types";

const base: K8sClusterSummary = {
  version: "v1.30.0",
  node_count: 3,
  ready_node_count: 2,
  namespace_count: 4,
  deployment_count: 1,
  service_count: 1,
  total_pods: 10,
  pod_capacity: 110,
  pod_counts: { Running: 10 },
  recent_warnings: [
    {
      namespace: "default",
      name: "e",
      kind: "Pod",
      reason: "Failed",
      message: "x",
    },
  ],
  metrics: {
    cpu_usage: "500m",
    cpu_capacity: "2000m",
    memory_usage: "1Gi",
    memory_capacity: "4Gi",
  },
};

describe("buildK8sStatusBarChips", () => {
  it("returns empty placeholder without cluster", () => {
    const chips = buildK8sStatusBarChips({
      clusterName: null,
      summary: null,
      loading: false,
    });
    expect(chips).toEqual([
      expect.objectContaining({ id: "empty", tone: "is-muted" }),
    ]);
  });

  it("sets name chip title from kind and id when provided", () => {
    const chips = buildK8sStatusBarChips({
      clusterName: "firefly",
      clusterKind: "kubeconfig",
      clusterId: "ctx-abc",
      summary: base,
      loading: false,
    });
    expect(chips[0]).toMatchObject({
      id: "name",
      label: "firefly",
      title: "kubeconfig · ctx-abc",
    });
  });

  it("shows idle nodes placeholder when summary missing and not loading", () => {
    const chips = buildK8sStatusBarChips({
      clusterName: "firefly",
      summary: null,
      loading: false,
    });
    expect(chips).toHaveLength(2);
    expect(chips[0]).toMatchObject({ id: "name", label: "firefly" });
    expect(chips[1]).toMatchObject({
      id: "nodes",
      label: "…",
      tone: "is-muted",
      loading: true,
    });
  });

  it("shows loading ellipsis when loading without summary", () => {
    const chips = buildK8sStatusBarChips({
      clusterName: "firefly",
      summary: null,
      loading: true,
    });
    expect(chips[0]).toMatchObject({ id: "name", label: "firefly" });
    expect(chips.some((c) => c.loading && c.label === "…")).toBe(true);
  });

  it("builds nodes pods cpu mem warnings from summary", () => {
    const chips = buildK8sStatusBarChips({
      clusterName: "firefly",
      summary: base,
      loading: false,
    });
    const byId = Object.fromEntries(chips.map((c) => [c.id, c]));
    expect(byId.version?.label).toContain("v1.30");
    expect(byId.nodes).toMatchObject({ label: "2/3", tone: "is-warn" });
    expect(byId.pods?.label).toBe("10/110");
    expect(byId.cpu?.label).toBe("25%");
    expect(byId.mem?.label).toBe("25%");
    expect(byId.warnings).toMatchObject({ label: "1", tone: "is-warn" });
  });

  it("omits cpu/mem when metrics missing", () => {
    const chips = buildK8sStatusBarChips({
      clusterName: "c",
      summary: { ...base, metrics: null, recent_warnings: [] },
      loading: false,
    });
    expect(chips.find((c) => c.id === "cpu")).toBeUndefined();
    expect(chips.find((c) => c.id === "mem")).toBeUndefined();
    expect(chips.find((c) => c.id === "warnings")?.tone).toBe("");
  });
});

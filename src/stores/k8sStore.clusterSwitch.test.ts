import { beforeEach, describe, expect, it, vi } from "vitest";
import type { K8sClusterSummary, K8sClusterTarget } from "../lib/k8s/types";

const k8sClusterSummary = vi.fn();
const k8sListNamespaces = vi.fn();

vi.mock("../lib/k8s/api", () => ({
  k8sClusterSummary: (...args: unknown[]) => k8sClusterSummary(...args),
  k8sDiscoverContexts: vi.fn(),
  k8sDeleteSshBinding: vi.fn(),
  k8sGetResource: vi.fn(),
  k8sHelmGetValues: vi.fn(),
  k8sHelmListCharts: vi.fn(),
  k8sHelmListReleases: vi.fn(),
  k8sImportKubeconfig: vi.fn(),
  k8sImportKubeconfigYaml: vi.fn(),
  k8sListNamespaces: (...args: unknown[]) => k8sListNamespaces(...args),
  k8sListResources: vi.fn(),
  k8sListCrdInstances: vi.fn(),
  k8sListApplications: vi.fn(),
  k8sListSshBindings: vi.fn(),
  k8sPortForwardList: vi.fn(),
  k8sProbeSshKubectl: vi.fn(),
  k8sRemoveImportedKubeconfig: vi.fn(),
  k8sRenameImportedKubeconfig: vi.fn(),
  k8sSaveSshBinding: vi.fn(),
  k8sToolsInstall: vi.fn(),
  k8sToolsStatus: vi.fn(),
  k8sTopPods: vi.fn(),
}));

vi.mock("./aiEngineerStore", () => ({
  useAiEngineerStore: {
    getState: () => ({
      bindK8sContext: vi.fn(),
      close: vi.fn(),
    }),
  },
}));

vi.mock("./managedEntityStore", () => ({
  focusManagedEntity: vi.fn(),
  useManagedEntityStore: {
    getState: () => ({
      openHome: vi.fn(),
    }),
  },
}));

const clusterA: K8sClusterTarget = {
  id: "kube:a",
  kind: "kubeconfig",
  display_name: "131",
  context: "131",
  namespace: "default",
};

const clusterB: K8sClusterTarget = {
  id: "kube:b",
  kind: "kubeconfig",
  display_name: "firefly",
  context: "firefly",
  namespace: "default",
};

const summaryA: K8sClusterSummary = {
  version: "v1.29.5+k3s1",
  node_count: 1,
  ready_node_count: 1,
  namespace_count: 10,
  deployment_count: 37,
  service_count: 54,
  total_pods: 67,
  pod_capacity: 110,
  pod_counts: { Running: 63 },
  recent_warnings: [
    {
      namespace: "common",
      name: "my-statefulset-0",
      kind: "Pod",
      reason: "Failed",
      message: "ErrImagePull",
      age: null,
    },
  ],
};

describe("k8sStore cluster switch isolation", () => {
  beforeEach(async () => {
    vi.resetModules();
    k8sClusterSummary.mockReset();
    k8sListNamespaces.mockReset();
    k8sListNamespaces.mockResolvedValue(["default"]);
  });

  async function loadStore() {
    const { useK8sStore } = await import("./k8sStore");
    useK8sStore.setState({
      clusters: [clusterA, clusterB],
      openClusterIds: [clusterA.id, clusterB.id],
      selectedClusterId: clusterA.id,
      selectedCluster: clusterA,
      category: "cluster_overview",
      clusterSummary: summaryA,
      clusterSummaryLoading: false,
      error: null,
      rows: [],
      namespaces: ["default"],
      loading: false,
    });
    return useK8sStore;
  }

  it("clears previous cluster summary immediately when selecting another cluster", async () => {
    k8sClusterSummary.mockImplementation(
      () => new Promise(() => {
        /* never resolves — unreachable cluster */
      }),
    );
    const useK8sStore = await loadStore();

    useK8sStore.getState().selectCluster(clusterB.id);

    const state = useK8sStore.getState();
    expect(state.selectedClusterId).toBe(clusterB.id);
    expect(state.clusterSummary).toBeNull();
    expect(state.clusterSummaryLoading).toBe(true);
  });

  it("does not keep cluster A summary when cluster B summary fetch fails", async () => {
    k8sClusterSummary.mockRejectedValue(new Error("context firefly unreachable"));
    const useK8sStore = await loadStore();

    useK8sStore.getState().selectCluster(clusterB.id);
    await vi.waitFor(() => {
      expect(useK8sStore.getState().clusterSummaryLoading).toBe(false);
    });

    const state = useK8sStore.getState();
    expect(state.selectedClusterId).toBe(clusterB.id);
    expect(state.clusterSummary).toBeNull();
    expect(state.error).toMatch(/unreachable/i);
  });

  it("ignores late summary responses from the previously selected cluster", async () => {
    let resolveA: (value: K8sClusterSummary) => void = () => undefined;
    const pendingA = new Promise<K8sClusterSummary>((resolve) => {
      resolveA = resolve;
    });

    k8sClusterSummary.mockImplementation((cluster: K8sClusterTarget) => {
      if (cluster.id === clusterA.id) return pendingA;
      return Promise.reject(new Error("firefly down"));
    });

    const useK8sStore = await loadStore();

    const refreshA = useK8sStore.getState().refreshClusterSummary();
    useK8sStore.getState().selectCluster(clusterB.id);
    await vi.waitFor(() => {
      expect(useK8sStore.getState().clusterSummaryLoading).toBe(false);
    });

    resolveA(summaryA);
    await refreshA;

    const state = useK8sStore.getState();
    expect(state.selectedClusterId).toBe(clusterB.id);
    expect(state.clusterSummary).toBeNull();
  });

  it("resets namespace filter when switching clusters", async () => {
    k8sListNamespaces.mockImplementation((cluster: K8sClusterTarget) => {
      if (cluster.id === clusterA.id) {
        return Promise.resolve(["common", "default", "demo"]);
      }
      return Promise.resolve(["default", "kube-system"]);
    });
    const useK8sStore = await loadStore();
    useK8sStore.setState({
      allNamespaces: false,
      selectedNamespaces: ["common", "demo", "default"],
      namespace: "common",
    });

    useK8sStore.getState().selectCluster(clusterB.id);

    expect(useK8sStore.getState().allNamespaces).toBe(true);
    expect(useK8sStore.getState().selectedNamespaces).toEqual([]);

    await vi.waitFor(() => {
      expect(useK8sStore.getState().namespaces).toEqual([
        "default",
        "kube-system",
      ]);
    });
    expect(useK8sStore.getState().allNamespaces).toBe(true);
    expect(useK8sStore.getState().selectedNamespaces).toEqual([]);
  });
});

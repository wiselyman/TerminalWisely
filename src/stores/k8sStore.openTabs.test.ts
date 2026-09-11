import { beforeEach, describe, expect, it, vi } from "vitest";
import type { K8sClusterTarget, K8sResourceRow } from "../lib/k8s/types";

vi.mock("../lib/k8s/api", () => ({
  k8sClusterSummary: vi.fn(),
  k8sDiscoverContexts: vi.fn().mockResolvedValue([]),
  k8sDeleteSshBinding: vi.fn(),
  k8sGetResource: vi.fn().mockResolvedValue({
    kind: "Pod",
    namespace: "default",
    name: "a",
    yaml: "kind: Pod",
    overview: {},
  }),
  k8sHelmGetValues: vi.fn(),
  k8sHelmListCharts: vi.fn(),
  k8sHelmListReleases: vi.fn(),
  k8sImportKubeconfig: vi.fn(),
  k8sImportKubeconfigYaml: vi.fn(),
  k8sListNamespaces: vi.fn().mockResolvedValue(["default"]),
  k8sListResources: vi.fn().mockResolvedValue([]),
  k8sListCrdInstances: vi.fn(),
  k8sListApplications: vi.fn(),
  k8sListSshBindings: vi.fn().mockResolvedValue([]),
  k8sPortForwardList: vi.fn().mockResolvedValue([]),
  k8sProbeSshKubectl: vi.fn(),
  k8sRemoveImportedKubeconfig: vi.fn(),
  k8sRenameImportedKubeconfig: vi.fn(),
  k8sSaveSshBinding: vi.fn(),
  k8sToolsInstall: vi.fn(),
  k8sToolsStatus: vi.fn(),
  k8sTopPods: vi.fn(),
  k8sUpdateSshBindingSession: vi.fn(),
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
  useManagedEntityStore: {
    getState: () => ({
      openHome: vi.fn(),
      focusManagedEntity: vi.fn(),
    }),
  },
}));

vi.mock("./toastStore", () => ({
  useToastStore: {
    getState: () => ({
      pushToast: vi.fn(),
    }),
  },
}));

vi.mock("./sessionStore", () => ({
  useSessionStore: {
    getState: () => ({
      tabs: [],
      activeTabId: null,
      savedConnections: [],
      connectSaved: vi.fn(),
    }),
  },
}));

vi.mock("../lib/managedEntityFocus", () => ({
  focusManagedEntity: vi.fn(),
}));

import { useK8sStore } from "./k8sStore";

const cluster: K8sClusterTarget = {
  id: "c1",
  kind: "kubeconfig",
  display_name: "demo",
  context: "demo",
  kubeconfig_path: null,
  kubectl_use_sudo: false,
  session_id: null,
  server_id: null,
  namespace: "default",
};

const podA: K8sResourceRow = {
  namespace: "default",
  name: "pod-a",
  kind: "Pod",
};
const podB: K8sResourceRow = {
  namespace: "default",
  name: "pod-b",
  kind: "Pod",
};
const svc: K8sResourceRow = {
  namespace: "default",
  name: "web",
  kind: "Service",
};

describe("k8s open resource tabs", () => {
  beforeEach(() => {
    useK8sStore.setState({
      clusters: [cluster],
      selectedClusterId: cluster.id,
      selectedCluster: cluster,
      openClusterIds: [cluster.id],
      category: "pods",
      openResources: [],
      selectedResource: null,
      detail: null,
      jumpHostGate: null,
      loading: false,
      clusterSummaryLoading: false,
    });
  });

  it("keeps prior tabs when selecting another resource", async () => {
    await useK8sStore.getState().selectResource(podA);
    await useK8sStore.getState().selectResource(podB);
    const open = useK8sStore.getState().openResources;
    expect(open.map((r) => r.name)).toEqual(["pod-a", "pod-b"]);
    expect(useK8sStore.getState().selectedResource?.name).toBe("pod-b");
  });

  it("does not clear open tabs when changing category", async () => {
    await useK8sStore.getState().selectResource(podA);
    useK8sStore.getState().setCategory("services");
    expect(useK8sStore.getState().openResources.map((r) => r.name)).toEqual([
      "pod-a",
    ]);
    await useK8sStore.getState().selectResource(svc);
    expect(useK8sStore.getState().openResources.map((r) => r.name)).toEqual([
      "pod-a",
      "web",
    ]);
  });
});

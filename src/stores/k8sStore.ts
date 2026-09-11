import { create } from "zustand";
import {
  k8sClusterSummary,
  k8sDiscoverContexts,
  k8sDeleteSshBinding,
  k8sGetResource,
  k8sHelmGetValues,
  k8sHelmListCharts,
  k8sHelmListReleases,
  k8sImportKubeconfig,
  k8sImportKubeconfigYaml,
  k8sListNamespaces,
  k8sListResources,
  k8sListCrdInstances,
  k8sListApplications,
  k8sListSshBindings,
  k8sPortForwardList,
  k8sProbeSshKubectl,
  k8sRemoveImportedKubeconfig,
  k8sRenameImportedKubeconfig,
  k8sSaveSshBinding,
  k8sToolsInstall,
  k8sToolsStatus,
  k8sTopPods,
  k8sUpdateSshBindingSession,
  type K8sToolKind,
  type K8sToolsStatus,
} from "../lib/k8s/api";
import type {
  K8sClusterSummary,
  K8sClusterTarget,
  K8sContextInfo,
  K8sCrdBrowseContext,
  K8sResourceCategory,
  K8sResourceDetail,
  K8sResourceRow,
  K8sSortDir,
  K8sSortField,
  PortForwardInfo,
} from "../lib/k8s/types";
import { syncOpenClusterTabIds, resolveSelectedCluster } from "../lib/k8s/clusterTabs";
import {
  categoryForKind,
  defaultClusterNamespaceSelection,
  loadAllNamespaces,
  loadClusterNamespaceSelection,
  loadSelectedNamespaces,
  saveAllNamespaces,
  saveClusterNamespaceSelection,
  saveSelectedNamespaces,
} from "../lib/k8s/navigation";
import {
  filterRowsByNamespaces,
  namespaceListParam,
  primaryNamespace,
  reconcileNamespaceSelection,
  selectionFromStore,
  type NamespaceSelection,
} from "../lib/k8s/namespacePicker";
import { useAiEngineerStore } from "./aiEngineerStore";
import { focusManagedEntity, useManagedEntityStore } from "./managedEntityStore";
import { useSessionStore } from "./sessionStore";
import { useToastStore } from "./toastStore";
import i18n from "../i18n";
import {
  findSavedConnectionForServer,
  jumpHostNeedsAuth,
  liveJumpHostSessionId,
} from "../lib/k8s/sshHostBind";

const STORAGE_NS = "tw.k8s.namespace";
const DEFAULT_SSH_COLS = 120;
const DEFAULT_SSH_ROWS = 32;

export type JumpHostGateStatus =
  | "confirm"
  | "connecting"
  | "needs_auth"
  | "failed"
  | "missing_bookmark";

export type JumpHostGate = {
  clusterId: string;
  status: JumpHostGateStatus;
  hostLabel: string;
  savedId: string | null;
};

function loadNs(): string {
  try {
    return localStorage.getItem(STORAGE_NS) || "default";
  } catch {
    return "default";
  }
}

function formatK8sError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (
    /kubectl not found/i.test(raw) ||
    /does not bundle kubectl/i.test(raw) ||
    /kubectl failed to start/i.test(raw) ||
    /Use Install kubectl/i.test(raw)
  ) {
    return "kubectl_missing";
  }
  if (/helm not found/i.test(raw) || /Use Install Helm/i.test(raw)) {
    return "helm_missing";
  }
  return raw;
}

/** True when overview collapsed kubectl failures into an all-zero "healthy" blob. */
function summaryLooksEmpty(
  summary: K8sClusterSummary | null | undefined,
): boolean {
  if (!summary) return true;
  return (
    !summary.version &&
    summary.node_count === 0 &&
    summary.namespace_count === 0 &&
    summary.total_pods === 0
  );
}

function resourceKey(row: { kind: string; namespace: string; name: string }) {
  return `${row.kind}/${row.namespace}/${row.name}`;
}

interface K8sState {
  contexts: K8sContextInfo[];
  sshBindings: K8sClusterTarget[];
  clusters: K8sClusterTarget[];
  openClusterIds: string[];
  selectedClusterId: string | null;
  selectedCluster: K8sClusterTarget | null;
  category: K8sResourceCategory;
  namespace: string;
  namespaces: string[];
  /** When false, `selectedNamespaces` filters the resource list (Lens multi-select). */
  allNamespaces: boolean;
  selectedNamespaces: string[];
  rows: K8sResourceRow[];
  loading: boolean;
  error: string | null;
  selectedResource: { kind: string; namespace: string; name: string } | null;
  openResources: K8sResourceRow[];
  detail: K8sResourceDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  yamlDraft: string;
  addClusterOpen: boolean;
  portForwards: PortForwardInfo[];
  toolsStatus: K8sToolsStatus | null;
  toolsBusy: boolean;
  clusterSummary: K8sClusterSummary | null;
  clusterSummaryLoading: boolean;
  metricsAvailable: boolean;
  sortField: K8sSortField;
  sortDir: K8sSortDir;
  crdBrowse: K8sCrdBrowseContext | null;
  /** SSH jump-host gate for ssh_kubectl clusters without a live session. */
  jumpHostGate: JumpHostGate | null;
  setAddClusterOpen: (open: boolean) => void;
  refreshClusters: () => Promise<void>;
  selectCluster: (id: string | null) => void;
  /** Retry / complete jump-host SSH connect (optional password). */
  ensureJumpHostConnected: (opts?: {
    password?: string | null;
    rememberPassword?: boolean;
  }) => Promise<boolean>;
  /** User dismissed the confirm dialog — close this cluster tab. */
  cancelJumpHostGate: () => void;
  clearJumpHostGate: () => void;
  closeClusterTab: (id: string) => void;
  setCategory: (c: K8sResourceCategory) => void;
  setNamespace: (ns: string) => void;
  setAllNamespaces: (all: boolean) => void;
  /** Apply Lens-style All / multi-select namespace filter. */
  applyNamespaceSelection: (selection: NamespaceSelection) => void;
  refreshNamespaces: () => Promise<void>;
  refreshResources: (opts?: { silent?: boolean }) => Promise<void>;
  selectResource: (row: K8sResourceRow) => Promise<void>;
  closeResourceTab: (row: K8sResourceRow) => void;
  setYamlDraft: (yaml: string) => void;
  refreshPortForwards: () => Promise<void>;
  refreshClusterSummary: (opts?: { silent?: boolean }) => Promise<void>;
  setSort: (field: K8sSortField) => void;
  setCrdBrowse: (ctx: K8sCrdBrowseContext | null) => void;
  navigateToResource: (target: {
    kind: string;
    namespace: string;
    name: string;
  }) => Promise<void>;
  bindSshCluster: (opts: {
    display_name: string;
    session_id: string;
    server_id?: string | null;
  }) => Promise<K8sClusterTarget>;
  attachSshClusterSession: (
    clusterId: string,
    sessionId: string,
  ) => Promise<void>;
  /** Pull kubeconfig/sudo flags from persisted SSH bindings into store state. */
  syncSshClusterAccess: (clusterId: string) => Promise<void>;
  removeSshBinding: (id: string) => Promise<void>;
  importKubeconfig: (path: string, displayName?: string) => Promise<void>;
  importKubeconfigYaml: (yaml: string, displayName?: string) => Promise<void>;
  renameImportedKubeconfig: (path: string, displayName: string) => Promise<void>;
  removeImportedKubeconfig: (path: string) => Promise<void>;
  refreshToolsStatus: () => Promise<void>;
  installTools: (tool: K8sToolKind) => Promise<void>;
}

function applyClusterList(
  contexts: K8sContextInfo[],
  sshBindings: K8sClusterTarget[],
  selectedClusterId: string | null,
  preferDisplayName?: string | null,
) {
  const clusters = buildClusters(contexts, sshBindings);
  const preferred = resolveSelectedCluster(
    clusters,
    selectedClusterId,
    preferDisplayName,
  );
  return {
    contexts,
    sshBindings,
    clusters,
    selectedClusterId: preferred?.id ?? null,
    selectedCluster: preferred,
    loading: false,
    error: null as string | null,
  };
}

function buildClusters(
  contexts: K8sContextInfo[],
  sshBindings: K8sClusterTarget[],
): K8sClusterTarget[] {
  const local: K8sClusterTarget[] = contexts.map((c) => {
    const path = c.kubeconfig_path?.trim() || "";
    const id = path ? `kube:${path}:${c.name}` : `kube:${c.name}`;
    const rawName =
      (c as { display_name?: string | null; displayName?: string | null })
        .display_name ??
      (c as { displayName?: string | null }).displayName;
    return {
      id,
      kind: "kubeconfig" as const,
      display_name: rawName?.trim() || c.name,
      context: c.name,
      kubeconfig_path: path || null,
      source: c.source ?? "default",
      namespace: loadNs(),
    };
  });
  return [...local, ...sshBindings];
}

export const useK8sStore = create<K8sState>((set, get) => ({
  contexts: [],
  sshBindings: [],
  clusters: [],
  openClusterIds: [],
  selectedClusterId: null,
  selectedCluster: null,
  category: "cluster_overview",
  namespace: loadNs(),
  namespaces: [],
  allNamespaces: loadAllNamespaces(),
  selectedNamespaces: loadSelectedNamespaces(loadNs()),
  rows: [],
  loading: false,
  error: null,
  selectedResource: null,
  openResources: [],
  detail: null,
  detailLoading: false,
  detailError: null,
  yamlDraft: "",
  addClusterOpen: false,
  portForwards: [],
  toolsStatus: null,
  toolsBusy: false,
  clusterSummary: null,
  clusterSummaryLoading: false,
  metricsAvailable: false,
  sortField: "name",
  sortDir: "asc",
  crdBrowse: null,
  jumpHostGate: null,

  setAddClusterOpen: (open) => set({ addClusterOpen: open }),
  clearJumpHostGate: () => set({ jumpHostGate: null }),

  cancelJumpHostGate: () => {
    const gate = get().jumpHostGate;
    set({ jumpHostGate: null, loading: false, clusterSummaryLoading: false });
    if (gate?.clusterId) {
      get().closeClusterTab(gate.clusterId);
    }
  },

  refreshClusters: async () => {
    set({ loading: true, error: null });
    try {
      const [contexts, sshBindings] = await Promise.all([
        k8sDiscoverContexts().catch(() => []),
        k8sListSshBindings().catch(() => []),
      ]);
      const next = applyClusterList(contexts, sshBindings, get().selectedClusterId);
      // Only restore a previously selected cluster (or import target). Do not
      // auto-open the first cluster — that triggers heavy API work and feels laggy.
      const openClusterIds = syncOpenClusterTabIds(
        get().openClusterIds,
        next.clusters.map((c) => c.id),
        next.selectedCluster?.id ?? null,
      );
      set({ ...next, openClusterIds });
      if (next.selectedCluster) {
        focusManagedEntity({
          kind: "cluster",
          id: next.selectedCluster.id,
          label: next.selectedCluster.display_name,
        });
        useAiEngineerStore
          .getState()
          .bindK8sContext(
            next.selectedCluster.id,
            next.selectedCluster.display_name,
            next.selectedCluster,
          );
        void get().refreshNamespaces();
        if (get().category === "cluster_overview") {
          void get().refreshClusterSummary();
        }
      }
      void get().refreshToolsStatus();
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  selectCluster: (id) => {
    let cluster = get().clusters.find((c) => c.id === id) ?? null;
    const { tabs, activeTabId } = useSessionStore.getState();
    const sshTabs = tabs.filter((tab) => tab.kind === "ssh");
    let liveSession: string | null = null;
    if (cluster?.kind === "ssh_kubectl") {
      liveSession = liveJumpHostSessionId(cluster, sshTabs, activeTabId);
      if (liveSession && liveSession !== cluster.session_id) {
        cluster = { ...cluster, session_id: liveSession };
        void get().attachSshClusterSession(cluster.id, liveSession);
      }
    }
    const openClusterIds =
      id && !get().openClusterIds.includes(id)
        ? [...get().openClusterIds, id]
        : get().openClusterIds;
    const category = get().category;
    const needsSummary =
      category === "cluster_overview" || category === "workloads_overview";
    const nsSelection = cluster
      ? loadClusterNamespaceSelection(cluster.id, cluster.namespace || "default")
      : defaultClusterNamespaceSelection();
    const needsJumpHost =
      cluster?.kind === "ssh_kubectl" && liveSession == null;

    let jumpHostGate: JumpHostGate | null = null;
    if (needsJumpHost && cluster) {
      const saved = findSavedConnectionForServer(
        useSessionStore.getState().savedConnections,
        cluster.server_id,
      );
      const hostLabel =
        saved?.name || cluster.display_name || cluster.server_id || "";
      if (!saved) {
        jumpHostGate = {
          clusterId: cluster.id,
          status: "missing_bookmark",
          hostLabel,
          savedId: null,
        };
      } else {
        jumpHostGate = {
          clusterId: cluster.id,
          status: "confirm",
          hostLabel,
          savedId: saved.id,
        };
      }
    }

    // Drop previous cluster's cached overview/list data immediately so a
    // slow/failed fetch for the new target never leaves another cluster's
    // metrics (e.g. 131) visible under firefly.
    set({
      selectedClusterId: id,
      selectedCluster: cluster,
      openClusterIds,
      rows: [],
      namespaces: [],
      allNamespaces: nsSelection.allNamespaces,
      selectedNamespaces: nsSelection.selectedNamespaces,
      namespace: nsSelection.namespace,
      selectedResource: null,
      openResources: [],
      detail: null,
      detailError: null,
      detailLoading: false,
      yamlDraft: "",
      clusterSummary: null,
      clusterSummaryLoading:
        Boolean(cluster) && needsSummary && !needsJumpHost,
      error: null,
      loading: Boolean(cluster) && category !== "cluster_overview" && !needsJumpHost,
      jumpHostGate,
    });
    if (cluster) {
      focusManagedEntity({
        kind: "cluster",
        id: cluster.id,
        label: cluster.display_name,
      });
      useAiEngineerStore
        .getState()
        .bindK8sContext(cluster.id, cluster.display_name, cluster);
    }
    if (needsJumpHost) {
      // Wait for user confirm dialog — do not auto-connect or fetch.
      return;
    }
    if (cluster) {
      void get().refreshNamespaces();
      if (category === "cluster_overview") {
        void get().refreshClusterSummary();
      }
    }
    if (category !== "cluster_overview") {
      void get().refreshResources();
    }
  },

  ensureJumpHostConnected: async (opts) => {
    const cluster = get().selectedCluster;
    if (!cluster || cluster.kind !== "ssh_kubectl") {
      set({ jumpHostGate: null });
      return true;
    }
    const { tabs, activeTabId, savedConnections, connectSaved } =
      useSessionStore.getState();
    const sshTabs = tabs.filter((tab) => tab.kind === "ssh");
    const live = liveJumpHostSessionId(cluster, sshTabs, activeTabId);
    if (live) {
      await get().attachSshClusterSession(cluster.id, live);
      const updated = {
        ...cluster,
        session_id: live,
      };
      set({
        selectedCluster: updated,
        jumpHostGate: null,
        clusterSummary: null,
        clusterSummaryLoading: true,
        loading: false,
      });
      focusManagedEntity({
        kind: "cluster",
        id: updated.id,
        label: updated.display_name,
      });
      if (
        get().category === "cluster_overview" ||
        get().category === "workloads_overview"
      ) {
        await Promise.all([
          get().refreshNamespaces(),
          get().refreshClusterSummary(),
        ]);
      } else {
        await Promise.all([
          get().refreshNamespaces(),
          get().refreshResources(),
        ]);
      }
      await get().syncSshClusterAccess(cluster.id);
      return true;
    }

    const saved = findSavedConnectionForServer(
      savedConnections,
      cluster.server_id,
    );
    const hostLabel = saved?.name || cluster.display_name || cluster.server_id || "";

    if (!saved) {
      set({
        jumpHostGate: {
          clusterId: cluster.id,
          status: "missing_bookmark",
          hostLabel,
          savedId: null,
        },
        clusterSummaryLoading: false,
        loading: false,
      });
      return false;
    }

    if (jumpHostNeedsAuth(saved) && !opts?.password) {
      set({
        jumpHostGate: {
          clusterId: cluster.id,
          status: "needs_auth",
          hostLabel,
          savedId: saved.id,
        },
        clusterSummaryLoading: false,
        loading: false,
      });
      return false;
    }

    set({
      jumpHostGate: {
        clusterId: cluster.id,
        status: "connecting",
        hostLabel,
        savedId: saved.id,
      },
      clusterSummary: null,
      clusterSummaryLoading: false,
      loading: false,
      error: null,
    });

    const sessionId = await connectSaved(
      saved.id,
      opts?.password ?? null,
      opts?.rememberPassword ?? false,
      DEFAULT_SSH_COLS,
      DEFAULT_SSH_ROWS,
    );

    if (get().selectedClusterId !== cluster.id) return false;

    if (!sessionId) {
      const nextStatus: JumpHostGateStatus =
        saved.auth_method === "password" ? "needs_auth" : "failed";
      set({
        jumpHostGate: {
          clusterId: cluster.id,
          status: nextStatus,
          hostLabel,
          savedId: saved.id,
        },
      });
      return false;
    }

    await get().attachSshClusterSession(cluster.id, sessionId);
    const updated = { ...cluster, session_id: sessionId };
    set({
      selectedCluster: updated,
      clusters: get().clusters.map((c) => (c.id === cluster.id ? updated : c)),
      jumpHostGate: null,
      clusterSummary: null,
      clusterSummaryLoading: true,
      loading: false,
      error: null,
    });
    focusManagedEntity({
      kind: "cluster",
      id: updated.id,
      label: updated.display_name,
    });
    useAiEngineerStore
      .getState()
      .bindK8sContext(updated.id, updated.display_name, updated);
    useToastStore.getState().pushToast(
      i18n.t("k8s:jumpHostConnected", { host: hostLabel }),
      true,
    );
    await Promise.all([
      get().refreshNamespaces(),
      get().refreshClusterSummary(),
    ]);
    // Summary warm-up persists kubeconfig into bindings; sync so later UI
    // invokes skip the SSH probe loop.
    await get().syncSshClusterAccess(cluster.id);
    // Right after SSH connect, kubectl can briefly fail and summary helpers
    // collapse that into zeros/"healthy". Retry once when it looks empty.
    if (
      get().selectedClusterId === cluster.id &&
      summaryLooksEmpty(get().clusterSummary)
    ) {
      await new Promise((r) => setTimeout(r, 400));
      if (get().selectedClusterId === cluster.id) {
        await get().refreshClusterSummary();
      }
    }
    if (
      get().selectedClusterId === cluster.id &&
      get().category !== "cluster_overview" &&
      get().category !== "workloads_overview"
    ) {
      await get().refreshResources();
    }
    return true;
  },

  closeClusterTab: (id) => {
    const openClusterIds = get().openClusterIds.filter((x) => x !== id);
    const wasActive = get().selectedClusterId === id;
    set({ openClusterIds });
    if (wasActive) {
      const nextId = openClusterIds[openClusterIds.length - 1] ?? null;
      if (nextId) {
        get().selectCluster(nextId);
      } else {
        set({
          selectedClusterId: null,
          selectedCluster: null,
          rows: [],
          openResources: [],
          selectedResource: null,
          detail: null,
          clusterSummary: null,
          clusterSummaryLoading: false,
          error: null,
          loading: false,
          jumpHostGate: null,
        });
        useAiEngineerStore.getState().close({ force: true });
        useManagedEntityStore.getState().openHome();
      }
    }
  },

  setCategory: (category) => {
    if (get().jumpHostGate) return;
    // Keep open resource tabs + selection across nav changes (Lens-style).
    set({
      category,
      crdBrowse: null,
    });
    if (category === "cluster_overview" || category === "workloads_overview") {
      void get().refreshClusterSummary();
    } else {
      void get().refreshResources();
    }
  },

  setNamespace: (namespace) => {
    get().applyNamespaceSelection({
      mode: "selected",
      namespaces: [namespace],
    });
  },

  setAllNamespaces: (allNamespaces) => {
    if (allNamespaces) {
      get().applyNamespaceSelection({ mode: "all" });
      return;
    }
    const current = get().selectedNamespaces;
    get().applyNamespaceSelection({
      mode: "selected",
      namespaces:
        current.length > 0 ? current : [get().namespace || "default"],
    });
  },

  applyNamespaceSelection: (selection) => {
    const clusterId = get().selectedClusterId;
    if (selection.mode === "all") {
      saveAllNamespaces(true);
      const namespace = get().namespace || "default";
      set({ allNamespaces: true, selectedNamespaces: [] });
      if (clusterId) {
        saveClusterNamespaceSelection(clusterId, {
          allNamespaces: true,
          selectedNamespaces: [],
          namespace,
        });
      }
      void get().refreshResources();
      return;
    }
    const namespaces = selection.namespaces.filter(Boolean);
    const primary = primaryNamespace({
      mode: "selected",
      namespaces: namespaces.length > 0 ? namespaces : ["default"],
    });
    try {
      localStorage.setItem(STORAGE_NS, primary);
    } catch {
      /* ignore */
    }
    saveAllNamespaces(false);
    saveSelectedNamespaces(namespaces.length > 0 ? namespaces : [primary]);
    set({
      allNamespaces: false,
      namespace: primary,
      selectedNamespaces: namespaces.length > 0 ? namespaces : [primary],
    });
    if (clusterId) {
      saveClusterNamespaceSelection(clusterId, {
        allNamespaces: false,
        selectedNamespaces: namespaces.length > 0 ? namespaces : [primary],
        namespace: primary,
      });
    }
    void get().refreshResources();
  },

  refreshNamespaces: async () => {
    const cluster = get().selectedCluster;
    if (!cluster) {
      set({ namespaces: [] });
      return;
    }
    const requestClusterId = cluster.id;
    try {
      const namespaces = await k8sListNamespaces(cluster);
      if (get().selectedClusterId !== requestClusterId) return;
      const reconciled = reconcileNamespaceSelection(namespaces, {
        allNamespaces: get().allNamespaces,
        selectedNamespaces: get().selectedNamespaces,
        namespace: get().namespace,
      });
      set({ namespaces, ...reconciled });
      saveClusterNamespaceSelection(requestClusterId, reconciled);
    } catch {
      if (get().selectedClusterId !== requestClusterId) return;
      set({ namespaces: [] });
    }
  },

  refreshResources: async (opts) => {
    const silent = opts?.silent ?? false;
    const cluster = get().selectedCluster;
    if (!cluster) return;
    const requestClusterId = cluster.id;
    const category = get().category;
    if (category === "cluster_overview") {
      void get().refreshClusterSummary({ silent });
      return;
    }
    if (category === "workloads_overview") {
      void get().refreshClusterSummary({ silent });
      if (get().selectedClusterId === requestClusterId) {
        set({ loading: false, rows: [], metricsAvailable: false });
      }
      return;
    }
    if (!silent) {
      set({ loading: true, error: null });
    }
    const applyIfCurrent = (patch: Partial<K8sState>) => {
      if (get().selectedClusterId !== requestClusterId) return;
      set(patch);
    };
    try {
      const selection = selectionFromStore(
        get().allNamespaces,
        get().selectedNamespaces,
        get().namespace,
      );
      const ns = namespaceListParam(selection);
      const browse = get().crdBrowse;
      if (browse) {
        const instances = await k8sListCrdInstances(
          cluster,
          browse.plural,
          ns,
        );
        applyIfCurrent({
          rows: filterRowsByNamespaces(instances, selection),
          loading: false,
          metricsAvailable: false,
        });
        return;
      }
      if (category === "helm_releases") {
        const releases = await k8sHelmListReleases(cluster, ns);
        const rows: K8sResourceRow[] = filterRowsByNamespaces(
          releases.map((r) => ({
            namespace: r.namespace,
            name: r.name,
            kind: "HelmRelease",
            status: r.status,
            age: r.updated ?? null,
            extra: r.chart,
            ready: `rev ${r.revision}`,
          })),
          selection,
        );
        applyIfCurrent({ rows, loading: false, metricsAvailable: false });
        return;
      }
      if (category === "helm_charts") {
        const charts = await k8sHelmListCharts(cluster);
        const rows: K8sResourceRow[] = charts.map((c) => ({
          namespace: "",
          name: c.name,
          kind: "HelmChart",
          status: c.version || null,
          age: null,
          extra: c.description || (c.app_version ? `app ${c.app_version}` : null),
        }));
        applyIfCurrent({ rows, loading: false, metricsAvailable: false });
        return;
      }
      if (category === "applications") {
        const rows = filterRowsByNamespaces(
          await k8sListApplications(cluster, ns),
          selection,
        );
        applyIfCurrent({ rows, loading: false, metricsAvailable: false });
        return;
      }
      if (category === "port_forwards") {
        await get().refreshPortForwards();
        if (get().selectedClusterId !== requestClusterId) return;
        const forwards = get().portForwards.filter(
          (pf) => pf.cluster_id === cluster.id,
        );
        const rows: K8sResourceRow[] = filterRowsByNamespaces(
          forwards.map((pf) => ({
            namespace: pf.namespace,
            name: pf.name,
            kind: pf.resource_kind,
            status: `${pf.local_port}→${pf.remote_port}`,
            age: null,
            extra: pf.mode,
          })),
          selection,
        );
        applyIfCurrent({ rows, loading: false, metricsAvailable: false });
        return;
      }
      let rows = await k8sListResources(cluster, category, ns);
      if (get().selectedClusterId !== requestClusterId) return;
      const hasMetrics =
        category === "pods" &&
        rows.some((r) => r.cpu != null || r.memory != null);
      if (category === "pods" && !hasMetrics) {
        const top = await k8sTopPods(cluster, ns).catch(() => []);
        if (get().selectedClusterId !== requestClusterId) return;
        if (top.length > 0) {
          const byKey = new Map(
            top.map((m) => [`${m.namespace}/${m.name}`, m] as const),
          );
          rows = rows.map((r) => {
            const m = byKey.get(`${r.namespace}/${r.name}`);
            if (!m) return r;
            return { ...r, cpu: m.cpu, memory: m.memory };
          });
        }
      }
      rows = filterRowsByNamespaces(rows, selection);
      applyIfCurrent({
        rows,
        loading: false,
        metricsAvailable:
          category === "pods" &&
          rows.some((r) => r.cpu != null || r.memory != null),
      });
    } catch (err) {
      applyIfCurrent({
        loading: false,
        error: formatK8sError(err),
        rows: [],
        metricsAvailable: false,
      });
    }
  },

  refreshClusterSummary: async (opts) => {
    const silent = opts?.silent ?? false;
    const cluster = get().selectedCluster;
    if (!cluster) {
      set({ clusterSummary: null, clusterSummaryLoading: false });
      return;
    }
    const requestClusterId = cluster.id;
    if (!silent) {
      // Use clusterSummaryLoading only — never flip global `loading`, or the
      // K8s sidebar cluster list unmounts while overview refreshes.
      set({
        clusterSummaryLoading: true,
        error: null,
      });
    }
    try {
      const clusterSummary = await k8sClusterSummary(cluster);
      if (get().selectedClusterId !== requestClusterId) return;
      set({
        clusterSummary,
        clusterSummaryLoading: false,
        loading: false,
      });
    } catch (err) {
      if (get().selectedClusterId !== requestClusterId) return;
      set({
        clusterSummary: null,
        clusterSummaryLoading: false,
        loading: false,
        error: formatK8sError(err),
      });
    }
  },

  setSort: (field) => {
    const cur = get();
    if (cur.sortField === field) {
      set({ sortDir: cur.sortDir === "asc" ? "desc" : "asc" });
    } else {
      set({ sortField: field, sortDir: "asc" });
    }
  },

  setCrdBrowse: (crdBrowse) => set({ crdBrowse }),

  navigateToResource: async (target) => {
    const category = categoryForKind(target.kind);
    if (!category) {
      throw new Error(`Unsupported resource kind: ${target.kind || "unknown"}`);
    }
    if (!get().selectedCluster) return;

    if (target.namespace) {
      try {
        localStorage.setItem(STORAGE_NS, target.namespace);
      } catch {
        /* ignore */
      }
      saveAllNamespaces(false);
      saveSelectedNamespaces([target.namespace]);
      set({
        namespace: target.namespace,
        allNamespaces: false,
        selectedNamespaces: [target.namespace],
      });
    }

    set({
      category,
      crdBrowse: null,
    });

    if (category === "cluster_overview") {
      await get().refreshClusterSummary();
    } else {
      await get().refreshResources();
    }

    await get().selectResource({
      kind: target.kind,
      namespace: target.namespace,
      name: target.name,
    });
  },

  selectResource: async (row) => {
    const cluster = get().selectedCluster;
    if (!cluster) return;
    const openResources = get().openResources.some(
      (r) => resourceKey(r) === resourceKey(row),
    )
      ? get().openResources
      : [...get().openResources, row];
    set({
      selectedResource: {
        kind: row.kind,
        namespace: row.namespace,
        name: row.name,
      },
      openResources,
      detailLoading: true,
      detailError: null,
      detail: null,
    });
    try {
      if (row.kind === "HelmRelease") {
        const values = await k8sHelmGetValues(
          cluster,
          row.namespace,
          row.name,
        );
        set({
          detail: {
            kind: "HelmRelease",
            namespace: row.namespace,
            name: row.name,
            yaml: values,
            overview: {
              kind: "HelmRelease",
              name: row.name,
              namespace: row.namespace,
              status: row.status ?? "",
              chart: row.extra ?? "",
            },
          },
          detailLoading: false,
          detailError: null,
          yamlDraft: values,
        });
        return;
      }
      const detail = await k8sGetResource(
        cluster,
        row.kind,
        row.namespace,
        row.name,
      );
      set({
        detail,
        detailLoading: false,
        detailError: null,
        yamlDraft: detail.yaml,
      });
    } catch (err) {
      set({
        detailLoading: false,
        detail: null,
        detailError: formatK8sError(err),
      });
    }
  },

  closeResourceTab: (row) => {
    const key = resourceKey(row);
    const openResources = get().openResources.filter(
      (r) => resourceKey(r) !== key,
    );
    const wasActive =
      get().selectedResource &&
      resourceKey(get().selectedResource!) === key;
    set({ openResources });
    if (wasActive) {
      const next = openResources[openResources.length - 1] ?? null;
      if (next) {
        void get().selectResource(next);
      } else {
        set({
          selectedResource: null,
          detail: null,
          detailError: null,
          yamlDraft: "",
        });
      }
    }
  },

  setYamlDraft: (yaml) => set({ yamlDraft: yaml }),

  refreshToolsStatus: async () => {
    try {
      const toolsStatus = await k8sToolsStatus();
      set({ toolsStatus });
    } catch {
      set({ toolsStatus: null });
    }
  },

  installTools: async (tool) => {
    set({ toolsBusy: true, error: null });
    try {
      const toolsStatus = await k8sToolsInstall(tool);
      set({ toolsStatus, toolsBusy: false, error: null });
      void get().refreshResources();
      void get().refreshNamespaces();
    } catch (err) {
      const toolsStatus = await k8sToolsStatus().catch(() => get().toolsStatus);
      set({
        toolsStatus,
        toolsBusy: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  refreshPortForwards: async () => {
    try {
      const portForwards = await k8sPortForwardList();
      set({ portForwards });
    } catch {
      set({ portForwards: [] });
    }
  },

  bindSshCluster: async (opts) => {
    const probe = await k8sProbeSshKubectl(opts.session_id);
    if (!probe.ok) {
      throw new Error(probe.error || "kubectl not found on this SSH host");
    }
    const target = await k8sSaveSshBinding({
      display_name: opts.display_name,
      session_id: opts.session_id,
      server_id: opts.server_id,
      namespace: get().namespace,
      kubeconfig_path: probe.kubeconfig_path,
      kubectl_use_sudo: probe.kubectl_use_sudo,
    });
    await get().refreshClusters();
    return (
      get().clusters.find((c) => c.id === target.id) ?? target
    );
  },

  attachSshClusterSession: async (clusterId, sessionId) => {
    const cluster = get().clusters.find((c) => c.id === clusterId);
    if (!cluster || cluster.kind !== "ssh_kubectl") return;
    if (cluster.session_id === sessionId) return;
    await k8sUpdateSshBindingSession(clusterId, sessionId);
    const updated = { ...cluster, session_id: sessionId };
    set({
      clusters: get().clusters.map((c) => (c.id === clusterId ? updated : c)),
      sshBindings: get().sshBindings.map((c) =>
        c.id === clusterId ? updated : c,
      ),
      selectedCluster:
        get().selectedClusterId === clusterId
          ? updated
          : get().selectedCluster,
    });
  },

  syncSshClusterAccess: async (clusterId) => {
    const bindings = await k8sListSshBindings().catch(() => []);
    const binding = bindings.find((c) => c.id === clusterId);
    if (!binding) return;
    const path = binding.kubeconfig_path?.trim() || null;
    const useSudo = Boolean(binding.kubectl_use_sudo);
    if (!path && !useSudo) return;
    const patch = (c: K8sClusterTarget): K8sClusterTarget =>
      c.id === clusterId
        ? { ...c, kubeconfig_path: path, kubectl_use_sudo: useSudo }
        : c;
    set({
      clusters: get().clusters.map(patch),
      sshBindings: get().sshBindings.map(patch),
      selectedCluster:
        get().selectedClusterId === clusterId && get().selectedCluster
          ? patch(get().selectedCluster!)
          : get().selectedCluster,
    });
  },

  removeSshBinding: async (id) => {
    await k8sDeleteSshBinding(id);
    await get().refreshClusters();
  },

  importKubeconfig: async (path, displayName) => {
    const contexts = await k8sImportKubeconfig(path, displayName);
    const sshBindings = await k8sListSshBindings().catch(() => []);
    const next = applyClusterList(
      contexts,
      sshBindings,
      get().selectedClusterId,
      displayName,
    );
    set({
      ...next,
      openClusterIds: syncOpenClusterTabIds(
        get().openClusterIds,
        next.clusters.map((c) => c.id),
        next.selectedCluster?.id ?? null,
      ),
    });
    if (next.selectedCluster) {
      focusManagedEntity({
        kind: "cluster",
        id: next.selectedCluster.id,
        label: next.selectedCluster.display_name,
      });
      useAiEngineerStore
        .getState()
        .bindK8sContext(
          next.selectedCluster.id,
          next.selectedCluster.display_name,
          next.selectedCluster,
        );
      void get().refreshNamespaces();
      void get().refreshResources();
    }
  },

  importKubeconfigYaml: async (yaml, displayName) => {
    const contexts = await k8sImportKubeconfigYaml(yaml, displayName);
    const sshBindings = await k8sListSshBindings().catch(() => []);
    const next = applyClusterList(
      contexts,
      sshBindings,
      get().selectedClusterId,
      displayName,
    );
    set({
      ...next,
      openClusterIds: syncOpenClusterTabIds(
        get().openClusterIds,
        next.clusters.map((c) => c.id),
        next.selectedCluster?.id ?? null,
      ),
    });
    if (next.selectedCluster) {
      focusManagedEntity({
        kind: "cluster",
        id: next.selectedCluster.id,
        label: next.selectedCluster.display_name,
      });
      useAiEngineerStore
        .getState()
        .bindK8sContext(
          next.selectedCluster.id,
          next.selectedCluster.display_name,
          next.selectedCluster,
        );
      void get().refreshNamespaces();
      void get().refreshResources();
    }
  },

  renameImportedKubeconfig: async (path, displayName) => {
    const contexts = await k8sRenameImportedKubeconfig(path, displayName);
    const sshBindings = await k8sListSshBindings().catch(() => []);
    const next = applyClusterList(
      contexts,
      sshBindings,
      get().selectedClusterId,
      displayName,
    );
    set({
      ...next,
      openClusterIds: syncOpenClusterTabIds(
        get().openClusterIds,
        next.clusters.map((c) => c.id),
        next.selectedCluster?.id ?? null,
      ),
    });
    if (next.selectedCluster) {
      focusManagedEntity({
        kind: "cluster",
        id: next.selectedCluster.id,
        label: next.selectedCluster.display_name,
      });
      useAiEngineerStore
        .getState()
        .bindK8sContext(
          next.selectedCluster.id,
          next.selectedCluster.display_name,
          next.selectedCluster,
        );
    }
  },

  removeImportedKubeconfig: async (path) => {
    await k8sRemoveImportedKubeconfig(path);
    await get().refreshClusters();
  },
}));

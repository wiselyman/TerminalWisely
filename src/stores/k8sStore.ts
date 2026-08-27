import { create } from "zustand";
import {
  k8sClusterSummary,
  k8sDiscoverContexts,
  k8sDeleteSshBinding,
  k8sGetResource,
  k8sHelmGetValues,
  k8sHelmListReleases,
  k8sImportKubeconfig,
  k8sImportKubeconfigYaml,
  k8sListNamespaces,
  k8sListResources,
  k8sListSshBindings,
  k8sPortForwardList,
  k8sProbeSshKubectl,
  k8sRemoveImportedKubeconfig,
  k8sRenameImportedKubeconfig,
  k8sSaveSshBinding,
  k8sToolsInstall,
  k8sToolsStatus,
  k8sTopPods,
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
import {
  categoryForKind,
  loadAllNamespaces,
  loadAutoRefreshSec,
  saveAllNamespaces,
  saveAutoRefreshSec,
  type K8sAutoRefreshSec,
} from "../lib/k8s/navigation";
import { useAiEngineerStore } from "./aiEngineerStore";
import { focusManagedEntity, useManagedEntityStore } from "./managedEntityStore";

const STORAGE_NS = "tw.k8s.namespace";

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
  allNamespaces: boolean;
  rows: K8sResourceRow[];
  loading: boolean;
  error: string | null;
  selectedResource: { kind: string; namespace: string; name: string } | null;
  openResources: K8sResourceRow[];
  detail: K8sResourceDetail | null;
  detailLoading: boolean;
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
  autoRefreshSec: K8sAutoRefreshSec;
  setAddClusterOpen: (open: boolean) => void;
  refreshClusters: () => Promise<void>;
  selectCluster: (id: string | null) => void;
  closeClusterTab: (id: string) => void;
  setCategory: (c: K8sResourceCategory) => void;
  setNamespace: (ns: string) => void;
  setAllNamespaces: (all: boolean) => void;
  refreshNamespaces: () => Promise<void>;
  refreshResources: () => Promise<void>;
  selectResource: (row: K8sResourceRow) => Promise<void>;
  closeResourceTab: (row: K8sResourceRow) => void;
  setYamlDraft: (yaml: string) => void;
  refreshPortForwards: () => Promise<void>;
  refreshClusterSummary: () => Promise<void>;
  setSort: (field: K8sSortField) => void;
  setCrdBrowse: (ctx: K8sCrdBrowseContext | null) => void;
  setAutoRefreshSec: (sec: K8sAutoRefreshSec) => void;
  navigateToResource: (target: {
    kind: string;
    namespace: string;
    name: string;
  }) => Promise<void>;
  bindSshCluster: (opts: {
    display_name: string;
    session_id: string;
    server_id?: string | null;
  }) => Promise<void>;
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
  const prefer = preferDisplayName?.trim();
  const preferred =
    (prefer
      ? clusters.find(
          (c) =>
            c.display_name === prefer ||
            c.display_name.startsWith(`${prefer}/`),
        )
      : null) ??
    clusters.find((c) => c.id === selectedClusterId) ??
    clusters[0] ??
    null;
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
  rows: [],
  loading: false,
  error: null,
  selectedResource: null,
  openResources: [],
  detail: null,
  detailLoading: false,
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
  autoRefreshSec: loadAutoRefreshSec(),

  setAddClusterOpen: (open) => set({ addClusterOpen: open }),

  refreshClusters: async () => {
    set({ loading: true, error: null });
    try {
      const [contexts, sshBindings] = await Promise.all([
        k8sDiscoverContexts().catch(() => []),
        k8sListSshBindings().catch(() => []),
      ]);
      const next = applyClusterList(contexts, sshBindings, get().selectedClusterId);
      const openClusterIds = get().openClusterIds.filter((id) =>
        next.clusters.some((c) => c.id === id),
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
    const cluster = get().clusters.find((c) => c.id === id) ?? null;
    const openClusterIds =
      id && !get().openClusterIds.includes(id)
        ? [...get().openClusterIds, id]
        : get().openClusterIds;
    set({
      selectedClusterId: id,
      selectedCluster: cluster,
      openClusterIds,
      rows: [],
      namespaces: [],
      selectedResource: null,
      openResources: [],
      detail: null,
      yamlDraft: "",
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
      void get().refreshNamespaces();
      if (get().category === "cluster_overview") {
        void get().refreshClusterSummary();
      }
    }
    if (get().category !== "cluster_overview") {
      void get().refreshResources();
    }
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
        });
        useManagedEntityStore.getState().openHome();
      }
    }
  },

  setCategory: (category) => {
    set({
      category,
      selectedResource: null,
      openResources: [],
      detail: null,
      yamlDraft: "",
      crdBrowse: null,
    });
    if (category === "cluster_overview") {
      void get().refreshClusterSummary();
    } else {
      void get().refreshResources();
    }
  },

  setNamespace: (namespace) => {
    try {
      localStorage.setItem(STORAGE_NS, namespace);
    } catch {
      /* ignore */
    }
    set({ namespace, allNamespaces: false });
    saveAllNamespaces(false);
    void get().refreshResources();
  },

  setAllNamespaces: (allNamespaces) => {
    saveAllNamespaces(allNamespaces);
    set({ allNamespaces });
    void get().refreshResources();
  },

  refreshNamespaces: async () => {
    const cluster = get().selectedCluster;
    if (!cluster) {
      set({ namespaces: [] });
      return;
    }
    try {
      const namespaces = await k8sListNamespaces(cluster);
      set({ namespaces });
      const current = get().namespace;
      if (namespaces.length > 0 && !namespaces.includes(current)) {
        const next = namespaces.includes("default") ? "default" : namespaces[0];
        set({ namespace: next });
      }
    } catch {
      set({ namespaces: [] });
    }
  },

  refreshResources: async () => {
    const cluster = get().selectedCluster;
    if (!cluster) return;
    const category = get().category;
    if (category === "cluster_overview") {
      void get().refreshClusterSummary();
      return;
    }
    set({ loading: true, error: null });
    try {
      const ns = get().allNamespaces ? null : get().namespace;
      if (category === "helm_releases") {
        const releases = await k8sHelmListReleases(cluster, ns);
        const rows: K8sResourceRow[] = releases.map((r) => ({
          namespace: r.namespace,
          name: r.name,
          kind: "HelmRelease",
          status: r.status,
          age: null,
          extra: `${r.chart} · rev ${r.revision}`,
        }));
        set({ rows, loading: false, metricsAvailable: false });
        return;
      }
      let rows = await k8sListResources(cluster, category, ns);
      const hasMetrics =
        category === "pods" &&
        rows.some((r) => r.cpu != null || r.memory != null);
      if (category === "pods" && !hasMetrics) {
        const top = await k8sTopPods(cluster, ns).catch(() => []);
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
      set({
        rows,
        loading: false,
        metricsAvailable:
          category === "pods" &&
          rows.some((r) => r.cpu != null || r.memory != null),
      });
    } catch (err) {
      set({
        loading: false,
        error: formatK8sError(err),
        rows: [],
        metricsAvailable: false,
      });
    }
  },

  refreshClusterSummary: async () => {
    const cluster = get().selectedCluster;
    if (!cluster) {
      set({ clusterSummary: null, clusterSummaryLoading: false });
      return;
    }
    const onOverview = get().category === "cluster_overview";
    set({
      clusterSummaryLoading: true,
      ...(onOverview ? { loading: true, error: null } : {}),
    });
    try {
      const clusterSummary = await k8sClusterSummary(cluster);
      set({
        clusterSummary,
        clusterSummaryLoading: false,
        ...(onOverview ? { loading: false, rows: [] } : {}),
      });
    } catch (err) {
      set({
        clusterSummary: null,
        clusterSummaryLoading: false,
        ...(onOverview
          ? { loading: false, error: formatK8sError(err) }
          : {}),
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

  setAutoRefreshSec: (autoRefreshSec) => {
    saveAutoRefreshSec(autoRefreshSec);
    set({ autoRefreshSec });
  },

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
      set({ namespace: target.namespace, allNamespaces: false });
      saveAllNamespaces(false);
    }

    set({
      category,
      selectedResource: null,
      openResources: [],
      detail: null,
      yamlDraft: "",
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
      set({ detail, detailLoading: false, yamlDraft: detail.yaml });
    } catch (err) {
      set({
        detailLoading: false,
        error: formatK8sError(err),
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
    await k8sSaveSshBinding({
      display_name: opts.display_name,
      session_id: opts.session_id,
      server_id: opts.server_id,
      namespace: get().namespace,
    });
    await get().refreshClusters();
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
      openClusterIds:
        next.selectedCluster &&
        !get().openClusterIds.includes(next.selectedCluster.id)
          ? [...get().openClusterIds, next.selectedCluster.id]
          : get().openClusterIds,
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
      openClusterIds:
        next.selectedCluster &&
        !get().openClusterIds.includes(next.selectedCluster.id)
          ? [...get().openClusterIds, next.selectedCluster.id]
          : get().openClusterIds,
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
    set(next);
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

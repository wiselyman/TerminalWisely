import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Copy, RefreshCw, Terminal } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import {
  k8sApplyYaml,
  k8sDeleteResource,
  k8sListCrdInstances,
  k8sPodContainers,
  k8sPodLogs,
  k8sPodShellCommand,
  k8sPortForwardStart,
  k8sPortForwardStop,
  k8sScaleResource,
} from "../../lib/k8s/api";
import type {
  K8sResourceCategory,
  K8sResourceRow,
  K8sSortField,
  K8sWarningEvent,
} from "../../lib/k8s/types";
import { AUTO_REFRESH_OPTIONS } from "../../lib/k8s/navigation";
import { useAiEngineerStore } from "../../stores/aiEngineerStore";
import { useK8sStore } from "../../stores/k8sStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useSidebarViewStore } from "../../stores/sidebarViewStore";
import { useToastStore } from "../../stores/toastStore";
import { formatAppError } from "../../lib/formatAppError";
import { Modal } from "../Modal";
import { WorkbenchShell } from "../management/WorkbenchShell";
import { DarkSelect } from "./DarkSelect";
import { K8sClusterSummaryView } from "./K8sClusterSummary";
import { K8sPodShellTerminal } from "./K8sPodShellTerminal";
import { K8sCategoryIcon, K8sNavGroupIcon } from "./K8sNavIcons";

const NAV_GROUPS: Array<{
  id: string;
  items: K8sResourceCategory[];
}> = [
  { id: "cluster", items: ["cluster_overview", "nodes", "namespaces", "events"] },
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
      "horizontalpodautoscalers",
    ],
  },
  {
    id: "network",
    items: ["services", "ingresses", "networkpolicies", "endpoints"],
  },
  {
    id: "config",
    items: ["configmaps", "secrets", "resourcequotas", "limitranges"],
  },
  {
    id: "storage",
    items: [
      "persistentvolumeclaims",
      "persistentvolumes",
      "storageclasses",
    ],
  },
  {
    id: "access",
    items: [
      "serviceaccounts",
      "roles",
      "rolebindings",
      "clusterroles",
      "clusterrolebindings",
    ],
  },
  {
    id: "helm",
    items: ["helm_releases"],
  },
  {
    id: "custom",
    items: ["customresourcedefinitions"],
  },
];

const STORAGE_NAV = "tw.k8s.navExpanded";
const DEFAULT_EXPANDED = ["cluster", "workloads"];

const CLUSTER_SCOPED_CATEGORIES = new Set<K8sResourceCategory>([
  "nodes",
  "namespaces",
  "persistentvolumes",
  "storageclasses",
  "clusterroles",
  "clusterrolebindings",
  "customresourcedefinitions",
]);

function loadExpandedGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_NAV);
    if (!raw) return new Set(DEFAULT_EXPANDED);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set(DEFAULT_EXPANDED);
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set(DEFAULT_EXPANDED);
  }
}

function saveExpandedGroups(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_NAV, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

function groupIdForCategory(category: K8sResourceCategory): string | null {
  return NAV_GROUPS.find((g) => g.items.includes(category))?.id ?? null;
}
type ConfirmState =
  | { kind: "apply" }
  | { kind: "delete"; row: K8sResourceRow }
  | null;

function canScale(kind: string) {
  return kind === "Deployment" || kind === "StatefulSet" || kind === "ReplicaSet";
}

function canPortForward(kind: string) {
  return kind === "Pod" || kind === "Service";
}

function canLogs(kind: string) {
  return kind === "Pod";
}

function canShell(kind: string) {
  return kind === "Pod";
}

function parseScaleReplicas(
  detail: { overview: Record<string, string> } | null,
  row?: K8sResourceRow | null,
): string {
  for (const key of ["replicas", "Replicas"]) {
    const raw = detail?.overview[key];
    if (raw) {
      const n = Number.parseInt(raw, 10);
      if (!Number.isNaN(n)) return String(n);
    }
  }
  const ready = row?.ready ?? detail?.overview.ready;
  if (ready) {
    const m = ready.match(/\/(\d+)/);
    if (m) return m[1];
  }
  return "1";
}

type TableColumn = {
  id: string;
  labelKey: string;
  sortable?: K8sSortField;
  cell: (row: K8sResourceRow) => string;
};

function ageSortKey(age?: string | null): number {
  if (!age) return Number.MAX_SAFE_INTEGER;
  const m = age.match(/^(\d+)([smhd])$/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const n = Number.parseInt(m[1], 10);
  const unit = m[2];
  const mult =
    unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86_400;
  return n * mult;
}

function columnsForCategory(
  category: K8sResourceCategory,
  metricsAvailable: boolean,
): TableColumn[] {
  if (category === "pods") {
    const cols: TableColumn[] = [
      { id: "name", labelKey: "colName", sortable: "name", cell: (r) => r.name },
      {
        id: "namespace",
        labelKey: "colNamespace",
        sortable: "namespace",
        cell: (r) => r.namespace || "—",
      },
      { id: "status", labelKey: "colStatus", sortable: "status", cell: (r) => r.status ?? "—" },
      {
        id: "restarts",
        labelKey: "colRestarts",
        cell: (r) => (r.restarts != null ? String(r.restarts) : "—"),
      },
      { id: "node", labelKey: "colNode", cell: (r) => r.node ?? "—" },
      { id: "age", labelKey: "colAge", sortable: "age", cell: (r) => r.age ?? "—" },
    ];
    if (metricsAvailable) {
      cols.push(
        { id: "cpu", labelKey: "colCpu", cell: (r) => r.cpu ?? "—" },
        { id: "memory", labelKey: "colMemory", cell: (r) => r.memory ?? "—" },
      );
    }
    return cols;
  }
  if (category === "deployments") {
    return [
      { id: "name", labelKey: "colName", sortable: "name", cell: (r) => r.name },
      {
        id: "namespace",
        labelKey: "colNamespace",
        sortable: "namespace",
        cell: (r) => r.namespace || "—",
      },
      { id: "ready", labelKey: "colReady", cell: (r) => r.ready ?? "—" },
      { id: "age", labelKey: "colAge", sortable: "age", cell: (r) => r.age ?? "—" },
      { id: "status", labelKey: "colStatus", sortable: "status", cell: (r) => r.status ?? "—" },
    ];
  }
  return [
    {
      id: "namespace",
      labelKey: "colNamespace",
      sortable: "namespace",
      cell: (r) => r.namespace || "—",
    },
    { id: "name", labelKey: "colName", sortable: "name", cell: (r) => r.name },
    { id: "status", labelKey: "colStatus", sortable: "status", cell: (r) => r.status ?? "—" },
    { id: "extra", labelKey: "colExtra", cell: (r) => r.extra ?? "—" },
  ];
}

function sortRows(
  rows: K8sResourceRow[],
  field: K8sSortField,
  dir: "asc" | "desc",
): K8sResourceRow[] {
  const out = [...rows];
  const sign = dir === "asc" ? 1 : -1;
  out.sort((a, b) => {
    let cmp = 0;
    if (field === "name") cmp = a.name.localeCompare(b.name);
    else if (field === "namespace")
      cmp = a.namespace.localeCompare(b.namespace);
    else if (field === "status")
      cmp = (a.status ?? "").localeCompare(b.status ?? "");
    else cmp = ageSortKey(a.age) - ageSortKey(b.age);
    if (cmp === 0) cmp = a.name.localeCompare(b.name);
    return cmp * sign;
  });
  return out;
}

const OVERVIEW_META = new Set([
  "kind",
  "name",
  "namespace",
  "uid",
  "ownerrefs",
  "group",
  "version",
  "scope",
  "chart",
]);
const OVERVIEW_STATUS = new Set(["phase", "conditions", "ready", "status", "replicas"]);

function groupOverview(overview: Record<string, string>) {
  const status: Array<[string, string]> = [];
  const meta: Array<[string, string]> = [];
  const other: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(overview)) {
    const lk = k.toLowerCase();
    if (
      OVERVIEW_STATUS.has(lk) ||
      lk.includes("condition") ||
      lk.includes("phase")
    ) {
      status.push([k, v]);
    } else if (OVERVIEW_META.has(lk)) {
      meta.push([k, v]);
    } else {
      other.push([k, v]);
    }
  }
  return { status, meta, other };
}

export function K8sWorkbench() {
  const { t } = useTranslation(["k8s", "common"]);
  const pushToast = useToastStore((s) => s.pushToast);
  const cluster = useK8sStore((s) => s.selectedCluster);
  const category = useK8sStore((s) => s.category);
  const namespace = useK8sStore((s) => s.namespace);
  const namespaces = useK8sStore((s) => s.namespaces);
  const allNamespaces = useK8sStore((s) => s.allNamespaces);
  const rows = useK8sStore((s) => s.rows);
  const loading = useK8sStore((s) => s.loading);
  const error = useK8sStore((s) => s.error);
  const detail = useK8sStore((s) => s.detail);
  const detailLoading = useK8sStore((s) => s.detailLoading);
  const openResources = useK8sStore((s) => s.openResources);
  const closeResourceTab = useK8sStore((s) => s.closeResourceTab);
  const yamlDraft = useK8sStore((s) => s.yamlDraft);
  const setCategory = useK8sStore((s) => s.setCategory);
  const setNamespace = useK8sStore((s) => s.setNamespace);
  const setAllNamespaces = useK8sStore((s) => s.setAllNamespaces);
  const refreshResources = useK8sStore((s) => s.refreshResources);
  const selectResource = useK8sStore((s) => s.selectResource);
  const setYamlDraft = useK8sStore((s) => s.setYamlDraft);
  const selectedResource = useK8sStore((s) => s.selectedResource);
  const portForwards = useK8sStore((s) => s.portForwards);
  const refreshPortForwards = useK8sStore((s) => s.refreshPortForwards);
  const clusterSummary = useK8sStore((s) => s.clusterSummary);
  const clusterSummaryLoading = useK8sStore((s) => s.clusterSummaryLoading);
  const metricsAvailable = useK8sStore((s) => s.metricsAvailable);
  const sortField = useK8sStore((s) => s.sortField);
  const sortDir = useK8sStore((s) => s.sortDir);
  const setSort = useK8sStore((s) => s.setSort);
  const crdBrowse = useK8sStore((s) => s.crdBrowse);
  const setCrdBrowse = useK8sStore((s) => s.setCrdBrowse);
  const refreshClusterSummary = useK8sStore((s) => s.refreshClusterSummary);
  const autoRefreshSec = useK8sStore((s) => s.autoRefreshSec);
  const setAutoRefreshSec = useK8sStore((s) => s.setAutoRefreshSec);
  const navigateToResource = useK8sStore((s) => s.navigateToResource);
  const setActiveTab = useSessionStore((s) => s.setActiveTab);
  const setSidebarView = useSidebarViewStore((s) => s.setView);

  const [tableFilter, setTableFilter] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(loadExpandedGroups);
  const [menuRow, setMenuRow] = useState<K8sResourceRow | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [detailTab, setDetailTab] = useState<
    | "overview"
    | "yaml"
    | "apply"
    | "delete"
    | "scale"
    | "logs"
    | "shell"
    | "portForward"
  >("overview");
  const [pfLocal, setPfLocal] = useState("8080");
  const [pfRemote, setPfRemote] = useState("80");
  const [scaleReplicas, setScaleReplicas] = useState("1");

  const [logs, setLogs] = useState("");
  const [logsFollow, setLogsFollow] = useState(true);
  const [logsTail, setLogsTail] = useState(200);
  const [logsContainer, setLogsContainer] = useState("");
  const [logsContainers, setLogsContainers] = useState<string[]>([]);
  const [shellContainer, setShellContainer] = useState("");
  const [shellContainers, setShellContainers] = useState<string[]>([]);
  const [logsTarget, setLogsTarget] = useState<{
    namespace: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    if (cluster) {
      void refreshClusterSummary();
      if (category !== "cluster_overview") {
        void refreshResources();
      }
      void refreshPortForwards();
    }
  }, [cluster, category, refreshResources, refreshClusterSummary, refreshPortForwards]);

  useEffect(() => {
    if (!cluster || autoRefreshSec <= 0) return;
    const tick = () => {
      if (category === "cluster_overview") {
        void refreshClusterSummary();
      } else {
        void refreshResources();
      }
    };
    const id = window.setInterval(tick, autoRefreshSec * 1000);
    return () => window.clearInterval(id);
  }, [
    cluster,
    category,
    autoRefreshSec,
    refreshResources,
    refreshClusterSummary,
  ]);

  useEffect(() => {
    const gid = groupIdForCategory(category);
    if (!gid) return;
    setExpandedGroups((prev) => {
      if (prev.has(gid)) return prev;
      const next = new Set(prev);
      next.add(gid);
      saveExpandedGroups(next);
      return next;
    });
  }, [category]);

  useEffect(() => {
    if (!menuRow) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".k8s-col-actions")) {
        return;
      }
      setMenuRow(null);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [menuRow]);

  const isClusterScoped = CLUSTER_SCOPED_CATEGORIES.has(category);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      saveExpandedGroups(next);
      return next;
    });
  };

  useEffect(() => {
    if (detailTab !== "logs" || !logsFollow || !cluster || !logsTarget) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const text = await k8sPodLogs(
          cluster,
          logsTarget.namespace,
          logsTarget.name,
          logsContainer || null,
          logsTail,
        );
        if (!cancelled) setLogs(text);
      } catch {
        /* keep last */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [detailTab, logsFollow, cluster, logsTarget, logsContainer, logsTail]);

  const tableColumns = useMemo(
    () => columnsForCategory(category, metricsAvailable),
    [category, metricsAvailable],
  );

  const filteredRows = useMemo(() => {
    const q = tableFilter.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.namespace.toLowerCase().includes(q) ||
          (r.status ?? "").toLowerCase().includes(q) ||
          (r.extra ?? "").toLowerCase().includes(q) ||
          (r.node ?? "").toLowerCase().includes(q) ||
          r.kind.toLowerCase().includes(q),
      );
    }
    return sortRows(list, sortField, sortDir);
  }, [rows, tableFilter, sortField, sortDir]);

  if (!cluster) {
    return (
      <div className="k8s-workbench-empty">
        <p>{t("selectClusterHint")}</p>
      </div>
    );
  }

  const runDelete = async (row: K8sResourceRow) => {
    try {
      const res = await k8sDeleteResource(
        cluster,
        row.kind,
        row.namespace,
        row.name,
      );
      if (res.ok) {
        pushToast(t("deleteOk"), true);
        void refreshResources();
      } else {
        pushToast(res.error || res.stderr || t("deleteFailed"), false);
      }
    } catch (err) {
      pushToast(formatAppError(err), false);
    }
  };

  const runApply = async () => {
    try {
      const res = await k8sApplyYaml(cluster, yamlDraft);
      if (res.ok) {
        pushToast(t("applyOk"), true);
        void refreshResources();
      } else {
        pushToast(res.error || res.stderr || t("applyFailed"), false);
      }
    } catch (err) {
      pushToast(formatAppError(err), false);
    }
  };

  const openLogs = async (row: K8sResourceRow) => {
    try {
      const containers = await k8sPodContainers(
        cluster,
        row.namespace,
        row.name,
      ).catch(() => [] as string[]);
      setLogsContainers(containers);
      const container = containers[0] ?? "";
      setLogsContainer(container);
      setLogsTarget({ namespace: row.namespace, name: row.name });
      const text = await k8sPodLogs(
        cluster,
        row.namespace,
        row.name,
        container || null,
        logsTail,
      );
      setLogs(text);
      setLogsFollow(true);
      setDetailTab("logs");
    } catch (err) {
      pushToast(formatAppError(err), false);
    }
  };

  const fetchLogs = async (
    target: { namespace: string; name: string },
    container: string,
  ) => {
    try {
      const text = await k8sPodLogs(
        cluster,
        target.namespace,
        target.name,
        container || null,
        logsTail,
      );
      setLogs(text);
    } catch (err) {
      pushToast(formatAppError(err), false);
    }
  };

  const preparePodShell = async (row: K8sResourceRow) => {
    try {
      const containers = await k8sPodContainers(
        cluster,
        row.namespace,
        row.name,
      ).catch(() => [] as string[]);
      setShellContainers(containers);
      setShellContainer(containers[0] ?? "");
      setDetailTab("shell");
      if (
        selectedResource?.name !== row.name ||
        selectedResource.namespace !== row.namespace
      ) {
        await selectResource(row);
      }
    } catch (err) {
      pushToast(formatAppError(err) || t("podShellFailed"), false);
    }
  };

  const runSshPodShell = async (row: K8sResourceRow) => {
    if (!cluster.session_id) return;
    try {
      const cmd = await k8sPodShellCommand(
        cluster,
        row.namespace,
        row.name,
        shellContainer || null,
      );
      setActiveTab(cluster.session_id);
      setSidebarView("hosts");
      await invoke("terminal_input", {
        sessionId: cluster.session_id,
        data: `${cmd}\n`,
      });
      pushToast(t("podShellOpened"), true);
    } catch (err) {
      pushToast(formatAppError(err) || t("podShellFailed"), false);
    }
  };

  const focusClusterTerminal = () => {
    if (cluster.kind === "ssh_kubectl" && cluster.session_id) {
      setActiveTab(cluster.session_id);
      setSidebarView("hosts");
      pushToast(t("terminalFocused"), true);
      return;
    }
    pushToast(t("terminalNeedSshBind"), false);
  };

  const startPortForward = async () => {
    if (!selectedResource || !canPortForward(selectedResource.kind)) return;
    const localPort = Number.parseInt(pfLocal, 10);
    const remotePort = Number.parseInt(pfRemote, 10);
    if (Number.isNaN(localPort) || Number.isNaN(remotePort)) return;
    try {
      const info = await k8sPortForwardStart(
        cluster,
        selectedResource.kind,
        selectedResource.namespace,
        selectedResource.name,
        localPort,
        remotePort,
      );
      pushToast(
        info.mode === "ssh_remote"
          ? t("portForwardRemoteOk", {
              port: localPort,
              name: selectedResource.name,
            })
          : t("portForwardOk", {
              port: localPort,
              name: selectedResource.name,
            }),
        true,
      );
      void refreshPortForwards();
    } catch (err) {
      pushToast(formatAppError(err) || t("portForwardFailed"), false);
    }
  };

  const runScale = async () => {
    if (!selectedResource || !canScale(selectedResource.kind)) return;
    const replicas = Number.parseInt(scaleReplicas, 10);
    if (Number.isNaN(replicas) || replicas < 0) return;
    try {
      const res = await k8sScaleResource(
        cluster,
        selectedResource.kind.toLowerCase(),
        selectedResource.namespace,
        selectedResource.name,
        replicas,
      );
      pushToast(res.ok ? t("scaleOk") : res.error || t("scaleFailed"), res.ok);
      if (res.ok) void refreshResources();
    } catch (err) {
      pushToast(formatAppError(err), false);
    }
  };

  const listCrdInstances = async (row: K8sResourceRow) => {
    const extra = row.extra ?? "";
    const plural = extra.includes(".") ? extra.split(".")[0] : extra || row.name;
    const group = extra.includes(".") ? extra.split(".").slice(1).join(".") : "";
    if (!plural) {
      pushToast(t("crdPluralMissing"), false);
      return;
    }
    try {
      const ns = allNamespaces ? null : namespace;
      const instances = await k8sListCrdInstances(cluster, plural, ns);
      setCrdBrowse({ plural, group, crdName: row.name });
      useK8sStore.setState({
        rows: instances,
        loading: false,
        error: null,
      });
      pushToast(t("crdInstancesLoaded", { count: instances.length }), true);
    } catch (err) {
      pushToast(formatAppError(err), false);
    }
  };

  const copyResourceName = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      pushToast(t("copyNameOk"), true);
    } catch {
      pushToast(t("copyNameFailed"), false);
    }
  };

  const sendToEngineer = () => {
    if (!detail || !cluster) return;
    const phase =
      detail.overview.phase ??
      detail.overview.status ??
      detail.overview.conditions ??
      "";
    useAiEngineerStore
      .getState()
      .openK8sPanel(cluster.id, cluster.display_name, cluster);
    useAiEngineerStore.getState().setInput(
      t("aiEngineerPrompt", {
        kind: detail.kind,
        namespace: detail.namespace,
        name: detail.name,
        phase,
      }),
    );
    useAiEngineerStore.getState().requestComposerFocus();
  };

  const handleWarningClick = (ev: K8sWarningEvent) => {
    if (!ev.kind?.trim()) {
      pushToast(t("warningNavigateNoKind"), false);
      return;
    }
    void navigateToResource({
      kind: ev.kind,
      namespace: ev.namespace,
      name: ev.name,
    }).catch((err) => pushToast(formatAppError(err), false));
  };

  const showDetailPanel =
    category !== "cluster_overview" &&
    (selectedResource != null || openResources.length > 0);

  const onRowAction = async (
    action: string,
    row: K8sResourceRow,
  ) => {
    setMenuRow(null);
    switch (action) {
      case "details":
        setDetailTab("overview");
        void selectResource(row);
        break;
      case "edit":
        setDetailTab("yaml");
        void selectResource(row);
        break;
      case "logs":
        void selectResource(row);
        void openLogs(row);
        break;
      case "shell":
        void selectResource(row);
        setDetailTab("shell");
        void preparePodShell(row);
        break;
      case "scale":
        void selectResource(row);
        setScaleReplicas(parseScaleReplicas(null, row));
        setDetailTab("scale");
        break;
      case "portForward":
        void selectResource(row);
        setPfLocal("8080");
        setPfRemote("80");
        setDetailTab("portForward");
        break;
      case "delete":
        void selectResource(row);
        setDetailTab("delete");
        break;
      case "crdInstances":
        void listCrdInstances(row);
        break;
      case "useNamespace":
        if (row.kind === "Namespace") setNamespace(row.name);
        break;
      default:
        break;
    }
  };

  return (
    <>
    <WorkbenchShell
      className="k8s-workbench"
      detailResizable={showDetailPanel}
      statusBar={
        <div className="k8s-status-bar" role="status">
          <span className="k8s-status-cluster">
            {cluster.display_name}
            {clusterSummary?.version ? ` · ${clusterSummary.version}` : ""}
          </span>
          <label className="k8s-auto-refresh">
            <span>{t("autoRefresh")}</span>
            <DarkSelect
              value={String(autoRefreshSec)}
              onChange={(v) =>
                setAutoRefreshSec(
                  Number(v) as (typeof AUTO_REFRESH_OPTIONS)[number],
                )
              }
              aria-label={t("autoRefresh")}
              options={AUTO_REFRESH_OPTIONS.map((sec) => ({
                value: String(sec),
                label:
                  sec === 0
                    ? t("autoRefreshOff")
                    : t("autoRefreshSec", { sec }),
              }))}
            />
          </label>
          {cluster.kind === "ssh_kubectl" && cluster.session_id ? (
          <button
            type="button"
            className="k8s-kubectl-terminal-btn"
            title={t("openTerminal")}
            onClick={focusClusterTerminal}
          >
            <Terminal size={13} strokeWidth={2} />
            {t("openTerminal")}
          </button>
          ) : null}
          {portForwards.length > 0 ? (
            <div className="k8s-pf-bar">
              {portForwards.map((pf) => (
                <span key={pf.id} className="k8s-pf-chip">
                  {pf.name}:{pf.local_port}→{pf.remote_port}
                  {pf.mode === "ssh_remote" ? " (SSH)" : ""}
                  <button
                    type="button"
                    onClick={() =>
                      void k8sPortForwardStop(pf.id)
                        .then(() => {
                          pushToast(t("portForwardStopped"), true);
                          void refreshPortForwards();
                        })
                        .catch((err) => pushToast(formatAppError(err), false))
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      }
      leftNav={(
        <nav className="k8s-tree" aria-label={t("resourceTree")}>
          {NAV_GROUPS.map((group) => {
            const open = expandedGroups.has(group.id);
            return (
              <div
                key={group.id}
                className={`k8s-tree-group${open ? " open" : ""}`}
              >
                <button
                  type="button"
                  className="k8s-tree-group-label"
                  aria-expanded={open}
                  onClick={() => toggleGroup(group.id)}
                >
                  {open ? (
                    <ChevronDown size={12} strokeWidth={2} className="k8s-tree-chevron" />
                  ) : (
                    <ChevronRight size={12} strokeWidth={2} className="k8s-tree-chevron" />
                  )}
                  <K8sNavGroupIcon groupId={group.id} />
                  <span>{t(`navGroup.${group.id}`)}</span>
                </button>
                {open ? (
                  <div className="k8s-tree-children" role="group">
                    {group.items.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`k8s-tree-item${category === c ? " active" : ""}`}
                        onClick={() => setCategory(c)}
                      >
                        <K8sCategoryIcon category={c} />
                        <span>{t(`category.${c}`)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      )}
      main={(
        <section className="k8s-table-panel">
          {category === "cluster_overview" ? (
            <div className="k8s-table-scroll">
              <K8sClusterSummaryView
                summary={clusterSummary}
                loading={clusterSummaryLoading}
                clusterName={cluster.display_name}
                onWarningClick={handleWarningClick}
              />
            </div>
          ) : (
            <>
          <div className="k8s-table-toolbar">
            <input
              type="search"
              className="k8s-table-search"
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              placeholder={t("tableSearch")}
              aria-label={t("tableSearch")}
            />
            <span className="k8s-item-count">
              {t("itemCount", { count: filteredRows.length })}
            </span>
            <div className="k8s-workbench-ns">
              {!isClusterScoped ? (
                <>
              <label className="k8s-ns-check">
                <input
                  type="checkbox"
                  checked={allNamespaces}
                  onChange={(e) => setAllNamespaces(e.target.checked)}
                />
                <span className="k8s-ns-check-box" aria-hidden />
                {t("allNamespaces")}
              </label>
              {!allNamespaces ? (
                namespaces.length > 0 ? (
                  <DarkSelect
                    value={namespace}
                    onChange={(v) => setNamespace(v)}
                    aria-label={t("namespace")}
                    options={namespaces.map((ns) => ({
                      value: ns,
                      label: ns,
                    }))}
                  />
                ) : (
                  <input
                    value={namespace}
                    onChange={(e) => setNamespace(e.target.value)}
                    aria-label={t("namespace")}
                  />
                )
              ) : null}
                </>
              ) : null}
              <button
                type="button"
                className="k8s-refresh-btn"
                title={t("refresh")}
                aria-label={t("refresh")}
                disabled={loading}
                onClick={() => void refreshResources()}
              >
                <RefreshCw size={14} strokeWidth={2} className={loading ? "k8s-spin" : ""} />
              </button>
            </div>
          </div>
          {crdBrowse ? (
            <div className="k8s-crd-breadcrumb">
              <button
                type="button"
                onClick={() => {
                  setCrdBrowse(null);
                  setCategory("customresourcedefinitions");
                }}
              >
                {t("category.customresourcedefinitions")}
              </button>
              <span aria-hidden>›</span>
              <span>
                {crdBrowse.crdName}
                {crdBrowse.group ? `.${crdBrowse.group}` : ""}
              </span>
            </div>
          ) : null}
          <div className="k8s-table-scroll">
          {error === "kubectl_missing" ||
          error === "helm_missing" ||
          (error &&
            /kubectl not found|does not bundle kubectl|kubectl failed to start|Use Install kubectl|helm not found|Use Install Helm/i.test(
              error,
            )) ? (
            <div className="k8s-tools-banner" role="alert">
              <span>
                {error === "helm_missing"
                  ? t("helmNotFoundSidebar")
                  : t("kubectlNotFoundSidebar")}
              </span>
            </div>
          ) : error ? (
            <p className="k8s-error">{error}</p>
          ) : null}
          {loading ? <p className="k8s-loading">{t("loading")}</p> : null}
          {!loading && filteredRows.length === 0 ? (
            <p className="k8s-detail-empty">
              {tableFilter.trim()
                ? t("tableEmptyFiltered")
                : t("tableEmpty")}
            </p>
          ) : null}
          {filteredRows.length > 0 ? (
          <table className="k8s-table">
            <thead>
              <tr>
                {tableColumns.map((col) => (
                  <th key={col.id}>
                    {col.sortable ? (
                      <button
                        type="button"
                        className={`k8s-sort-header${sortField === col.sortable ? " active" : ""}`}
                        onClick={() => setSort(col.sortable!)}
                      >
                        {t(col.labelKey)}
                        {sortField === col.sortable
                          ? sortDir === "asc"
                            ? " ↑"
                            : " ↓"
                          : ""}
                      </button>
                    ) : (
                      t(col.labelKey)
                    )}
                  </th>
                ))}
                <th className="k8s-col-actions">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={`${row.namespace}/${row.kind}/${row.name}`}
                  className={
                    selectedResource?.name === row.name &&
                    selectedResource.namespace === row.namespace &&
                    selectedResource.kind === row.kind
                      ? "selected"
                      : ""
                  }
                  onClick={() => {
                    setDetailTab("overview");
                    void selectResource(row);
                  }}
                >
                  {tableColumns.map((col) => (
                    <td key={col.id}>{col.cell(row)}</td>
                  ))}
                  <td className="k8s-col-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="k8s-row-menu-btn"
                      aria-label={t("rowActions")}
                      aria-expanded={
                        menuRow?.name === row.name &&
                        menuRow.namespace === row.namespace &&
                        menuRow.kind === row.kind
                      }
                      onClick={() =>
                        setMenuRow((cur) =>
                          cur?.name === row.name &&
                          cur.namespace === row.namespace &&
                          cur.kind === row.kind
                            ? null
                            : row,
                        )
                      }
                    >
                      ⋮
                    </button>
                    {menuRow?.name === row.name &&
                    menuRow.namespace === row.namespace &&
                    menuRow.kind === row.kind ? (
                      <div className="k8s-row-menu" role="menu">
                        <button type="button" role="menuitem" onClick={() => void onRowAction("details", row)}>
                          {t("actionDetails")}
                        </button>
                        <button type="button" role="menuitem" onClick={() => void onRowAction("edit", row)}>
                          {t("actionEdit")}
                        </button>
                        {canLogs(row.kind) ? (
                          <button type="button" role="menuitem" onClick={() => void onRowAction("logs", row)}>
                            {t("logs")}
                          </button>
                        ) : null}
                        {canShell(row.kind) ? (
                          <button type="button" role="menuitem" onClick={() => void onRowAction("shell", row)}>
                            {t("podShell")}
                          </button>
                        ) : null}
                        {canScale(row.kind) ? (
                          <button type="button" role="menuitem" onClick={() => void onRowAction("scale", row)}>
                            {t("scale")}
                          </button>
                        ) : null}
                        {canPortForward(row.kind) ? (
                          <button type="button" role="menuitem" onClick={() => void onRowAction("portForward", row)}>
                            {t("portForward")}
                          </button>
                        ) : null}
                        {row.kind === "Namespace" ? (
                          <button type="button" role="menuitem" onClick={() => void onRowAction("useNamespace", row)}>
                            {t("useNamespace")}
                          </button>
                        ) : null}
                        {row.kind === "CustomResourceDefinition" ? (
                          <button type="button" role="menuitem" onClick={() => void onRowAction("crdInstances", row)}>
                            {t("listCrdInstances")}
                          </button>
                        ) : null}
                        {row.kind !== "HelmRelease" ? (
                          <button type="button" role="menuitem" className="danger" onClick={() => void onRowAction("delete", row)}>
                            {t("delete")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          ) : null}
          </div>
            </>
          )}
        </section>
      )}
      detail={
        showDetailPanel ? (
        <>
          {openResources.length > 0 ? (
            <div className="k8s-resource-tabs" role="tablist">
              {openResources.map((row) => {
                const active =
                  selectedResource?.name === row.name &&
                  selectedResource.namespace === row.namespace &&
                  selectedResource.kind === row.kind;
                return (
                  <button
                    key={`${row.kind}/${row.namespace}/${row.name}`}
                    type="button"
                    role="tab"
                    className={`k8s-resource-tab${active ? " active" : ""}`}
                    onClick={() => {
                      setDetailTab("overview");
                      void selectResource(row);
                    }}
                  >
                    <span className="tab-title">
                      {row.kind}/{row.name}
                    </span>
                    <span
                      className="k8s-resource-tab-close"
                      role="presentation"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeResourceTab(row);
                      }}
                    >
                      ×
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <aside className="k8s-detail-panel">
          {detailLoading ? <p>{t("loading")}</p> : null}
          {detail && selectedResource ? (
            <>
              <div className="k8s-detail-header">
                <div className="k8s-detail-title">
                  <strong>{selectedResource.name}</strong>
                  <span className="k8s-detail-subtitle">
                    {selectedResource.kind}
                    {selectedResource.namespace
                      ? ` · ${selectedResource.namespace}`
                      : ""}
                  </span>
                </div>
                <div className="k8s-detail-quick-actions">
                  <button
                    type="button"
                    className="k8s-detail-quick-btn"
                    title={t("copyName")}
                    onClick={() => void copyResourceName(selectedResource.name)}
                  >
                    <Copy size={13} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="k8s-detail-quick-btn primary"
                    onClick={sendToEngineer}
                  >
                    {t("sendToEngineer")}
                  </button>
                </div>
              </div>
              <div className="k8s-detail-tabs" role="tablist">
                <button type="button" role="tab" className={detailTab === "overview" ? "active" : ""} onClick={() => setDetailTab("overview")}>{t("detailOverview")}</button>
                <button type="button" role="tab" className={detailTab === "yaml" ? "active" : ""} onClick={() => setDetailTab("yaml")}>{t("detailYaml")}</button>
                {canLogs(selectedResource.kind) ? (
                  <button type="button" role="tab" className={detailTab === "logs" ? "active" : ""} onClick={() => void openLogs({ kind: selectedResource.kind, namespace: selectedResource.namespace, name: selectedResource.name })}>{t("logs")}</button>
                ) : null}
                {canShell(selectedResource.kind) ? (
                  <button type="button" role="tab" className={detailTab === "shell" ? "active" : ""} onClick={() => void preparePodShell({ kind: selectedResource.kind, namespace: selectedResource.namespace, name: selectedResource.name })}>{t("podShell")}</button>
                ) : null}
                {canScale(selectedResource.kind) ? (
                  <button type="button" role="tab" className={detailTab === "scale" ? "active" : ""} onClick={() => { setScaleReplicas(parseScaleReplicas(detail, rows.find((r) => r.name === selectedResource.name && r.namespace === selectedResource.namespace && r.kind === selectedResource.kind) ?? null)); setDetailTab("scale"); }}>{t("scale")}</button>
                ) : null}
                {canPortForward(selectedResource.kind) ? (
                  <button type="button" role="tab" className={detailTab === "portForward" ? "active" : ""} onClick={() => setDetailTab("portForward")}>{t("portForward")}</button>
                ) : null}
                {detail.kind !== "HelmRelease" ? (
                  <button type="button" role="tab" className={detailTab === "apply" ? "active" : ""} onClick={() => setDetailTab("apply")}>{t("apply")}</button>
                ) : null}
                {detail.kind !== "HelmRelease" ? (
                  <button type="button" role="tab" className={detailTab === "delete" ? "active" : ""} onClick={() => setDetailTab("delete")}>{t("delete")}</button>
                ) : null}
              </div>

              {detailTab === "overview" ? (
                (() => {
                  const groups = groupOverview(detail.overview);
                  const renderGroup = (
                    title: string,
                    entries: Array<[string, string]>,
                  ) =>
                    entries.length > 0 ? (
                      <section key={title} className="k8s-overview-group">
                        <h4>{title}</h4>
                        <dl>
                          {entries.map(([k, v]) => (
                            <div key={k} className="k8s-overview-row">
                              <dt>{k}</dt>
                              <dd>{v}</dd>
                            </div>
                          ))}
                        </dl>
                      </section>
                    ) : null;
                  return (
                    <div className="k8s-detail-overview">
                      {renderGroup(t("overviewStatus"), groups.status)}
                      {renderGroup(t("overviewMeta"), groups.meta)}
                      {renderGroup(t("overviewOther"), groups.other)}
                    </div>
                  );
                })()
              ) : null}

              {detailTab === "yaml" || detailTab === "apply" ? (
                <div className="k8s-detail-tab-body">
                  <textarea className="k8s-yaml-editor" value={yamlDraft} onChange={(e) => setYamlDraft(e.target.value)} spellCheck={false} readOnly={detail.kind === "HelmRelease"} />
                  {detailTab === "apply" && detail.kind !== "HelmRelease" ? (
                    <div className="k8s-detail-tab-actions">
                      <button type="button" className="find-panel-run primary" onClick={() => setConfirm({ kind: "apply" })}>{t("apply")}</button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {detailTab === "delete" ? (
                <div className="k8s-detail-tab-body k8s-detail-action-pane">
                  <p>{t("confirmDeleteBody", { name: selectedResource.name, kind: selectedResource.kind })}</p>
                  <div className="k8s-detail-tab-actions">
                    <button
                      type="button"
                      className="find-panel-run danger"
                      onClick={() =>
                        setConfirm({
                          kind: "delete",
                          row: {
                            kind: selectedResource.kind,
                            namespace: selectedResource.namespace,
                            name: selectedResource.name,
                          },
                        })
                      }
                    >
                      {t("delete")}
                    </button>
                  </div>
                </div>
              ) : null}

              {detailTab === "scale" ? (
                <div className="k8s-detail-tab-body k8s-detail-action-pane">
                  <label>{t("scaleReplicas")}<input type="number" min={0} value={scaleReplicas} onChange={(e) => setScaleReplicas(e.target.value)} /></label>
                  <div className="k8s-detail-tab-actions">
                    <button type="button" className="find-panel-run primary" onClick={() => void runScale()}>{t("scale")}</button>
                  </div>
                </div>
              ) : null}

              {detailTab === "logs" ? (
                <div className="k8s-detail-tab-body k8s-detail-logs">
                  <div className="k8s-detail-logs-toolbar">
                    {logsContainers.length > 0 ? (
                      <DarkSelect
                        value={logsContainer}
                        onChange={(next) => {
                          setLogsContainer(next);
                          if (logsTarget) {
                            void fetchLogs(logsTarget, next);
                          }
                        }}
                        aria-label={t("logsContainer")}
                        options={logsContainers.map((c) => ({
                          value: c,
                          label: c,
                        }))}
                      />
                    ) : null}
                    <label>{t("logsTail")}<input type="number" min={50} max={5000} value={logsTail} onChange={(e) => setLogsTail(Number.parseInt(e.target.value, 10) || 200)} /></label>
                    <label><input type="checkbox" checked={logsFollow} onChange={(e) => setLogsFollow(e.target.checked)} />{t("logsFollow")}</label>
                  </div>
                  <pre className="k8s-logs-pre">{logs || t("loading")}</pre>
                </div>
              ) : null}

              {detailTab === "shell" ? (
                <div className="k8s-detail-tab-body k8s-detail-shell-pane">
                  {cluster.kind === "kubeconfig" && selectedResource ? (
                    <>
                      {shellContainers.length > 1 ? (
                        <div className="k8s-detail-logs-toolbar">
                          <DarkSelect
                            value={shellContainer}
                            onChange={(v) => setShellContainer(v)}
                            aria-label={t("logsContainer")}
                            options={shellContainers.map((c) => ({
                              value: c,
                              label: c,
                            }))}
                          />
                        </div>
                      ) : null}
                      <K8sPodShellTerminal
                        key={`${selectedResource.namespace}/${selectedResource.name}/${shellContainer}`}
                        cluster={cluster}
                        namespace={selectedResource.namespace}
                        pod={selectedResource.name}
                        container={shellContainer || null}
                        onError={(msg) => pushToast(msg, false)}
                      />
                    </>
                  ) : (
                    <>
                      <p>{t("podShellSshHint")}</p>
                      {shellContainers.length > 0 ? (
                        <div className="k8s-detail-logs-toolbar">
                          <DarkSelect
                            value={shellContainer}
                            onChange={(v) => setShellContainer(v)}
                            aria-label={t("logsContainer")}
                            options={shellContainers.map((c) => ({
                              value: c,
                              label: c,
                            }))}
                          />
                        </div>
                      ) : null}
                      <div className="k8s-detail-tab-actions">
                        <button
                          type="button"
                          className="find-panel-run primary"
                          onClick={() =>
                            void runSshPodShell({
                              kind: selectedResource!.kind,
                              namespace: selectedResource!.namespace,
                              name: selectedResource!.name,
                            })
                          }
                        >
                          {t("podShell")}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {detailTab === "portForward" ? (
                <div className="k8s-detail-tab-body k8s-detail-action-pane">
                  <label>{t("portForwardLocal")}<input type="number" value={pfLocal} onChange={(e) => setPfLocal(e.target.value)} /></label>
                  <label>{t("portForwardRemote")}<input type="number" value={pfRemote} onChange={(e) => setPfRemote(e.target.value)} /></label>
                  <div className="k8s-detail-tab-actions">
                    <button type="button" className="find-panel-run primary" onClick={() => void startPortForward()}>{t("portForwardStart")}</button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="k8s-detail-empty">{t("selectResourceHint")}</p>
          )}
        </aside>
        </>
        ) : undefined
      }
      dock={null}
    />
      {confirm ? (
        <Modal
          title={
            confirm.kind === "apply" ? t("confirmApply") : t("confirmDelete")
          }
          onClose={() => setConfirm(null)}
        >
          <p className="modal-hint">
            {confirm.kind === "apply"
              ? t("confirmApplyBody")
              : t("confirmDeleteBody", {
                  name: confirm.row.name,
                  kind: confirm.row.kind,
                })}
          </p>
          <div className="form-row">
            <button
              type="button"
              className="find-panel-run primary"
              onClick={() => {
                const c = confirm;
                setConfirm(null);
                if (c.kind === "apply") void runApply();
                else {
                  void runDelete(c.row).then(() => {
                    setDetailTab("overview");
                    closeResourceTab(c.row);
                  });
                }
              }}
            >
              {t("common:confirm")}
            </button>
            <button type="button" onClick={() => setConfirm(null)}>
              {t("common:cancel")}
            </button>
          </div>
        </Modal>
      ) : null}

    </>
  );
}

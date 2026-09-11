import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  ArrowUp,
  Ban,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Copy,
  FilePlus,
  ListTree,
  MessageSquare,
  Package,
  RefreshCw,
  RotateCw,
  Save,
  Scaling,
  Search,
  Terminal,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import {
  k8sApplyYaml,
  k8sCordonNode,
  k8sDeleteResource,
  k8sDrainNode,
  k8sHelmAddRepo,
  k8sHelmChartValues,
  k8sHelmGetValues,
  k8sHelmInstall,
  k8sHelmRollback,
  k8sGetResource,
  k8sHelmUninstall,
  k8sHelmUpgrade,
  k8sListCrdInstances,
  k8sListCrdCatalog,
  k8sNodeShellCommand,
  k8sPodContainers,
  k8sPodLogs,
  k8sPodShellCommand,
  k8sPortForwardStart,
  k8sPortForwardStop,
  k8sRolloutRestart,
  k8sScaleResource,
  k8sUncordonNode,
} from "../../lib/k8s/api";
import {
  canLogs,
  canNodeShell,
  canPortForward,
  canRestart,
  canScale,
  canShell,
  ownedPodDeleteController,
  ownerNeedsParentResolve,
  preferWorkloadOwner,
  type K8sControllerOwner,
} from "../../lib/k8s/actions";
import {
  findActiveForward,
  parseForwardablePorts,
  portRowKey,
  suggestLocalPort,
} from "../../lib/k8s/forwardablePorts";
import { parsePodVolumes, volumeTypeI18nKey } from "../../lib/k8s/podVolumes";
import type {
  K8sCrdCatalogEntry,
  K8sResourceCategory,
  K8sResourceRow,
  K8sSortField,
  K8sWarningEvent,
} from "../../lib/k8s/types";
import { useAiEngineerStore } from "../../stores/aiEngineerStore";
import { useK8sStore } from "../../stores/k8sStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useSidebarViewStore } from "../../stores/sidebarViewStore";
import { useToastStore } from "../../stores/toastStore";
import { formatAppError } from "../../lib/formatAppError";
import { copyToClipboard } from "../../lib/clipboard";
import { categoryForKind } from "../../lib/k8s/navigation";
import {
  k8sErrorChatPrompt,
  k8sHealthChatPrompt,
  k8sLogsChatPrompt,
  k8sSelectionChatPrompt,
  k8sWarningChatPrompt,
  k8sYamlChatPrompt,
} from "../../lib/k8s/sendToChat";
import {
  createResourceYamlFromTemplate,
  defaultCreateResourceYaml,
  type K8sCreateTemplateId,
} from "../../lib/k8s/createResource";
import {
  buildNavGroups,
  CLUSTER_SCOPED_CATEGORIES,
  groupIdForCategory,
  loadExpandedGroups,
  saveExpandedGroups,
} from "../../lib/k8s/navConfig";
import { Modal } from "../Modal";
import { WorkbenchShell } from "../management/WorkbenchShell";
import { DarkSelect } from "./DarkSelect";
import { K8sNamespacePicker } from "./K8sNamespacePicker";
import { K8sClusterSummaryView } from "./K8sClusterSummary";
import { K8sCrdNavTree } from "./K8sCrdNavTree";
import { K8sResourceBar } from "./K8sResourceBar";
import { K8sSelectionContextMenu } from "./K8sSelectionContextMenu";
import { K8sPodShellTerminal } from "./K8sPodShellTerminal";
import { K8sYamlEditor } from "./K8sYamlEditor";
import {
  K8sClusterTerminalPanes,
  K8sClusterTerminalTabs,
  K8sCreateResourcePanes,
  K8sCreateResourceTabs,
  type K8sCreateResourceTab,
  type K8sTerminalTab,
} from "./K8sClusterTerminalPanel";
import { openK8sTerminalDock } from "../../lib/k8s/dock";
import { K8sCategoryIcon, K8sNavGroupIcon } from "./K8sNavIcons";

const STORAGE_CRD_NAV = "tw.k8s.crdNavExpanded";
/** Background list/overview refresh interval (Lens/Headlamp-style polling). */
const K8S_AUTO_REFRESH_MS = 5000;

function loadExpandedCrdGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_CRD_NAV);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function saveExpandedCrdGroups(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_CRD_NAV, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

type ConfirmState =
  | { kind: "apply" }
  | { kind: "delete"; row: K8sResourceRow; owner?: K8sControllerOwner | null }
  | { kind: "scale" }
  | { kind: "cordon"; row: K8sResourceRow }
  | { kind: "uncordon"; row: K8sResourceRow }
  | { kind: "drain"; row: K8sResourceRow }
  | { kind: "restart"; row: K8sResourceRow }
  | { kind: "helmInstall"; chart: string }
  | { kind: "helmUpgrade"; row: K8sResourceRow }
  | { kind: "helmRollback"; row: K8sResourceRow }
  | { kind: "helmUninstall"; row: K8sResourceRow }
  | { kind: "helmRepoAdd" }
  | null;

function nodeConditionCell(status?: string | null): ReactNode {
  const label = status ?? "—";
  if (label === "Ready") {
    return <span className="k8s-node-condition k8s-node-condition--ready">{label}</span>;
  }
  if (label === "NotReady") {
    return <span className="k8s-node-condition k8s-node-condition--bad">{label}</span>;
  }
  return label;
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

/** Use overview ownerRefs only when detail matches the row being deleted. */
function ownerRefsForRow(
  row: K8sResourceRow,
  detail: { kind: string; namespace: string; name: string; overview: Record<string, string> } | null,
): string | undefined {
  if (
    !detail ||
    detail.kind !== row.kind ||
    detail.name !== row.name ||
    detail.namespace !== row.namespace
  ) {
    return undefined;
  }
  return detail.overview.ownerRefs;
}

function controllerOwnerRow(
  owner: K8sControllerOwner,
  namespace: string,
): K8sResourceRow {
  return { kind: owner.kind, name: owner.name, namespace };
}

/**
 * Resolve the best delete target for a controller-owned Pod.
 * Lifts ReplicaSet→Deployment and Job→CronJob when the parent owns the immediate controller.
 */
async function resolveOwnedPodDeleteTarget(
  cluster: Parameters<typeof k8sGetResource>[0],
  row: K8sResourceRow,
  detail: {
    kind: string;
    namespace: string;
    name: string;
    overview: Record<string, string>;
  } | null,
): Promise<K8sControllerOwner | null> {
  const immediate = ownedPodDeleteController(
    row.kind,
    ownerRefsForRow(row, detail),
  );
  if (!immediate || !ownerNeedsParentResolve(immediate.kind)) {
    return immediate;
  }
  try {
    const parentDetail = await k8sGetResource(
      cluster,
      immediate.kind,
      row.namespace,
      immediate.name,
    );
    return preferWorkloadOwner(
      immediate,
      parentDetail.overview.ownerRefs ?? null,
    );
  } catch {
    return immediate;
  }
}

type TableColumn = {
  id: string;
  labelKey: string;
  sortable?: K8sSortField;
  cell: (row: K8sResourceRow) => ReactNode;
  className?: string;
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
  showNamespace: boolean,
): TableColumn[] {
  if (category === "pods") {
    const cols: TableColumn[] = [
      { id: "name", labelKey: "colName", sortable: "name", cell: (r) => r.name },
    ];
    if (showNamespace) {
      cols.push({
        id: "namespace",
        labelKey: "colNamespace",
        sortable: "namespace",
        cell: (r) => r.namespace || "—",
      });
    }
    cols.push(
      { id: "status", labelKey: "colStatus", sortable: "status", cell: (r) => r.status ?? "—" },
      {
        id: "restarts",
        labelKey: "colRestarts",
        cell: (r) => (r.restarts != null ? String(r.restarts) : "—"),
      },
      { id: "node", labelKey: "colNode", cell: (r) => r.node ?? "—" },
      { id: "age", labelKey: "colAge", sortable: "age", cell: (r) => r.age ?? "—" },
    );
    if (metricsAvailable) {
      cols.push(
        { id: "cpu", labelKey: "colCpu", cell: (r) => r.cpu ?? "—" },
        { id: "memory", labelKey: "colMemory", cell: (r) => r.memory ?? "—" },
      );
    }
    return cols;
  }
  if (category === "deployments" || category === "statefulsets" || category === "daemonsets" || category === "replicasets") {
    const cols: TableColumn[] = [
      { id: "name", labelKey: "colName", sortable: "name", cell: (r) => r.name },
    ];
    if (showNamespace) {
      cols.push({
        id: "namespace",
        labelKey: "colNamespace",
        sortable: "namespace",
        cell: (r) => r.namespace || "—",
      });
    }
    cols.push(
      { id: "ready", labelKey: "colReady", cell: (r) => r.ready ?? "—" },
      { id: "age", labelKey: "colAge", sortable: "age", cell: (r) => r.age ?? "—" },
      { id: "status", labelKey: "colStatus", sortable: "status", cell: (r) => r.status ?? "—" },
    );
    return cols;
  }
  if (category === "nodes") {
    return [
      { id: "name", labelKey: "colName", sortable: "name", cell: (r) => r.name },
      {
        id: "cpu",
        labelKey: "colCpu",
        className: "k8s-col-bar",
        cell: (r) => (
          <K8sResourceBar
            kind="cpu"
            usage={r.cpu}
            requests={r.cpu_requests}
            limits={r.cpu_limits}
            capacity={r.cpu_capacity}
          />
        ),
      },
      {
        id: "memory",
        labelKey: "colMemory",
        className: "k8s-col-bar",
        cell: (r) => (
          <K8sResourceBar
            kind="memory"
            usage={r.memory}
            requests={r.memory_requests}
            limits={r.memory_limits}
            capacity={r.memory_capacity}
          />
        ),
      },
      {
        id: "disk",
        labelKey: "colDisk",
        className: "k8s-col-bar",
        cell: (r) => (
          <K8sResourceBar
            kind="disk"
            requests={r.disk_requests}
            limits={r.disk_limits}
            capacity={r.disk_capacity}
          />
        ),
      },
      {
        id: "taints",
        labelKey: "colTaints",
        cell: (r) => String(r.taints ?? 0),
      },
      {
        id: "roles",
        labelKey: "colRoles",
        cell: (r) => r.roles ?? "—",
      },
      {
        id: "version",
        labelKey: "colVersion",
        cell: (r) => r.version ?? "—",
      },
      { id: "age", labelKey: "colAge", sortable: "age", cell: (r) => r.age ?? "—" },
      {
        id: "conditions",
        labelKey: "colConditions",
        sortable: "status",
        cell: (r) => nodeConditionCell(r.status),
      },
    ];
  }
  const cols: TableColumn[] = [
    { id: "name", labelKey: "colName", sortable: "name", cell: (r) => r.name },
  ];
  if (showNamespace) {
    cols.push({
      id: "namespace",
      labelKey: "colNamespace",
      sortable: "namespace",
      cell: (r) => r.namespace || "—",
    });
  }
  cols.push(
    { id: "status", labelKey: "colStatus", sortable: "status", cell: (r) => r.status ?? "—" },
    { id: "age", labelKey: "colAge", sortable: "age", cell: (r) => r.age ?? "—" },
    { id: "extra", labelKey: "colExtra", cell: (r) => r.extra ?? "—" },
  );
  return cols;
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

const OVERVIEW_IDENTITY = new Set(["kind", "name", "namespace"]);
const OVERVIEW_META = new Set([
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
    if (OVERVIEW_IDENTITY.has(lk)) {
      continue;
    } else if (
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
  const { t } = useTranslation(["k8s", "common", "terminal"]);
  const pushToast = useToastStore((s) => s.pushToast);
  const pushOpError = useCallback(
    (operation: string, message: string) => {
      const msg = String(message || "").trim() || t("applyFailed");
      pushToast(msg, false, {
        actionLabel: t("sendErrorToChat"),
        onAction: () => {
          const c = useK8sStore.getState().selectedCluster;
          if (!c) return;
          useAiEngineerStore
            .getState()
            .openK8sPanel(c.id, c.display_name, c);
          useAiEngineerStore.getState().setInput(
            k8sErrorChatPrompt({
              operation,
              error: msg,
              t: (key, vars) => t(key, vars),
            }),
          );
          useAiEngineerStore.getState().requestComposerFocus();
        },
      });
    },
    [pushToast, t],
  );
  const handleShellError = useCallback(
    (msg: string) => pushOpError("shell", msg),
    [pushOpError],
  );
  const cluster = useK8sStore((s) => s.selectedCluster);
  const category = useK8sStore((s) => s.category);
  const namespace = useK8sStore((s) => s.namespace);
  const namespaces = useK8sStore((s) => s.namespaces);
  const allNamespaces = useK8sStore((s) => s.allNamespaces);
  const selectedNamespaces = useK8sStore((s) => s.selectedNamespaces);
  const rows = useK8sStore((s) => s.rows);
  const loading = useK8sStore((s) => s.loading);
  const error = useK8sStore((s) => s.error);
  const detail = useK8sStore((s) => s.detail);
  const detailLoading = useK8sStore((s) => s.detailLoading);
  const detailError = useK8sStore((s) => s.detailError);
  const setAddClusterOpen = useK8sStore((s) => s.setAddClusterOpen);
  const openResources = useK8sStore((s) => s.openResources);
  const closeResourceTab = useK8sStore((s) => s.closeResourceTab);
  const yamlDraft = useK8sStore((s) => s.yamlDraft);
  const setCategory = useK8sStore((s) => s.setCategory);
  const setNamespace = useK8sStore((s) => s.setNamespace);
  const applyNamespaceSelection = useK8sStore((s) => s.applyNamespaceSelection);
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
  const navigateToResource = useK8sStore((s) => s.navigateToResource);
  const jumpHostGate = useK8sStore((s) => s.jumpHostGate);
  const ensureJumpHostConnected = useK8sStore((s) => s.ensureJumpHostConnected);
  const cancelJumpHostGate = useK8sStore((s) => s.cancelJumpHostGate);
  const setActiveTab = useSessionStore((s) => s.setActiveTab);
  const setSidebarView = useSidebarViewStore((s) => s.setView);

  const [jumpHostPasswordOpen, setJumpHostPasswordOpen] = useState(false);
  const [jumpHostPassword, setJumpHostPassword] = useState("");
  const [jumpHostRemember, setJumpHostRemember] = useState(true);
  const [jumpHostBusy, setJumpHostBusy] = useState(false);

  useEffect(() => {
    if (jumpHostGate?.status === "needs_auth" && jumpHostGate.savedId) {
      setJumpHostPasswordOpen(true);
    }
  }, [jumpHostGate?.status, jumpHostGate?.savedId, jumpHostGate?.clusterId]);

  const jumpHostBannerMessage = (gate: NonNullable<typeof jumpHostGate>) => {
    if (gate.status === "connecting" || gate.status === "confirm") {
      return t("jumpHostConnecting", { host: gate.hostLabel });
    }
    if (gate.status === "needs_auth") {
      return t("jumpHostNeedsAuth", { host: gate.hostLabel });
    }
    if (gate.status === "missing_bookmark") {
      return t("jumpHostMissingBookmark", { host: gate.hostLabel });
    }
    return t("jumpHostFailed", { host: gate.hostLabel });
  };

  const jumpHostBanner = jumpHostGate ? (
    <div
      className={`k8s-tools-banner${
        jumpHostGate.status === "connecting" || jumpHostGate.status === "confirm"
          ? " k8s-tools-banner--info"
          : ""
      }`}
      role="status"
      data-testid="k8s-jump-host-gate"
    >
      <span>
        {jumpHostGate.status === "confirm"
          ? t("jumpHostWaitingHint")
          : jumpHostBannerMessage(jumpHostGate)}
      </span>
      {jumpHostGate.status === "failed" || jumpHostGate.status === "needs_auth" ? (
        <div className="k8s-tools-actions">
          <button
            type="button"
            className="find-panel-run primary"
            disabled={jumpHostBusy}
            data-testid="k8s-jump-host-connect"
            onClick={() => {
              if (jumpHostGate.status === "needs_auth") {
                setJumpHostPasswordOpen(true);
                return;
              }
              setJumpHostBusy(true);
              void ensureJumpHostConnected().finally(() => setJumpHostBusy(false));
            }}
          >
            {t("jumpHostConnectCta")}
          </button>
        </div>
      ) : null}
    </div>
  ) : null;

  const [tableFilter, setTableFilter] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(loadExpandedGroups);
  const [expandedCrdGroups, setExpandedCrdGroups] = useState<Set<string>>(loadExpandedCrdGroups);
  const [crdCatalog, setCrdCatalog] = useState<K8sCrdCatalogEntry[]>([]);
  const [crdCatalogLoading, setCrdCatalogLoading] = useState(false);
  const navGroups = useMemo(() => buildNavGroups(), []);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [detailTab, setDetailTab] = useState<
    | "overview"
    | "yaml"
    | "logs"
    | "shell"
    | "portForward"
    | "clusterTerminal"
    | "createResource"
  >("overview");
  const [shellSessionReady, setShellSessionReady] = useState(false);
  const [terminalTabs, setTerminalTabs] = useState<K8sTerminalTab[]>([]);
  const [activeTerminalTabId, setActiveTerminalTabId] = useState<string | null>(
    null,
  );
  const [createResourceTabs, setCreateResourceTabs] = useState<K8sCreateResourceTab[]>(
    [],
  );
  const [activeCreateResourceTabId, setActiveCreateResourceTabId] = useState<
    string | null
  >(null);
  const [shellMode, setShellMode] = useState<"pod" | "node">("pod");
  const [shellPrepError, setShellPrepError] = useState<string | null>(null);
  const [pfLocal, setPfLocal] = useState("8080");
  const [pfRemote, setPfRemote] = useState("80");
  /** Per discovered port: local port draft keyed by `portRowKey`. */
  const [pfLocalByRow, setPfLocalByRow] = useState<Record<string, string>>({});
  const [scaleReplicas, setScaleReplicas] = useState("1");

  const [logs, setLogs] = useState("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsFollow, setLogsFollow] = useState(true);
  const [logsTail, setLogsTail] = useState(200);
  const [logsContainer, setLogsContainer] = useState("");
  const [logsContainers, setLogsContainers] = useState<string[]>([]);
  const logsPreRef = useRef<HTMLPreElement>(null);
  const [logsMenu, setLogsMenu] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);
  const [yamlFindOpen, setYamlFindOpen] = useState(false);
  const [shellContainer, setShellContainer] = useState("");
  const [shellContainers, setShellContainers] = useState<string[]>([]);
  const [logsTarget, setLogsTarget] = useState<{
    namespace: string;
    name: string;
    kind: string;
  } | null>(null);
  const [helmReleaseName, setHelmReleaseName] = useState("");
  const [helmNamespace, setHelmNamespace] = useState("default");
  const [helmValues, setHelmValues] = useState("");
  const [helmRepoName, setHelmRepoName] = useState("");
  const [helmRepoUrl, setHelmRepoUrl] = useState("");

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
    if (!cluster) return;
    const tick = () => {
      if (document.hidden) return;
      if (category === "cluster_overview") {
        void refreshClusterSummary({ silent: true });
        return;
      }
      void refreshResources({ silent: true });
      void refreshPortForwards();
    };
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    const id = window.setInterval(tick, K8S_AUTO_REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [
    cluster,
    category,
    refreshResources,
    refreshClusterSummary,
    refreshPortForwards,
  ]);

  useEffect(() => {
    if (!cluster) {
      setCrdCatalog([]);
      return;
    }
    let cancelled = false;
    setCrdCatalogLoading(true);
    void k8sListCrdCatalog(cluster)
      .then((entries) => {
        if (!cancelled) setCrdCatalog(entries);
      })
      .catch(() => {
        if (!cancelled) setCrdCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setCrdCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cluster]);

  useEffect(() => {
    const gid = groupIdForCategory(category, navGroups);
    if (!gid) return;
    setExpandedGroups((prev) => {
      if (prev.has(gid)) return prev;
      const next = new Set(prev);
      next.add(gid);
      saveExpandedGroups(next);
      return next;
    });
  }, [category, navGroups]);

  useEffect(() => {
    setShellSessionReady(false);
    setShellPrepError(null);
  }, [
    selectedResource?.kind,
    selectedResource?.namespace,
    selectedResource?.name,
  ]);

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

  const toggleCrdGroup = (group: string) => {
    setExpandedCrdGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      saveExpandedCrdGroups(next);
      return next;
    });
  };

  const selectCategory = (c: K8sResourceCategory) => {
    setCrdBrowse(null);
    setCategory(c);
  };

  const selectCrdDefinitions = () => {
    setCrdBrowse(null);
    setCategory("customresourcedefinitions");
  };

  const selectCrdEntry = (entry: K8sCrdCatalogEntry) => {
    useK8sStore.setState({
      category: "customresourcedefinitions",
      crdBrowse: {
        plural: entry.plural,
        group: entry.group,
        crdName: entry.name,
      },
      selectedResource: null,
      openResources: [],
      detail: null,
      yamlDraft: "",
    });
    void refreshResources();
  };

  useEffect(() => {
    if (detailTab !== "logs" || !logsFollow || !cluster || !logsTarget) return;
    let cancelled = false;
    const selectionInLogs = () => {
      if (logsMenu) return true;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
      const pre = logsPreRef.current;
      if (!pre) return false;
      const anchor = sel.anchorNode;
      return Boolean(anchor && pre.contains(anchor));
    };
    const tick = async () => {
      try {
        if (selectionInLogs()) return;
        const text = await k8sPodLogs(
          cluster,
          logsTarget.namespace,
          logsTarget.name,
          logsContainer || null,
          logsTail,
          logsTarget.kind,
        );
        if (cancelled || selectionInLogs()) return;
        setLogs((prev) => (prev === text ? prev : text));
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
  }, [detailTab, logsFollow, cluster, logsTarget, logsContainer, logsTail, logsMenu]);

  const showNamespaceColumn =
    !isClusterScoped &&
    (allNamespaces || selectedNamespaces.length > 1);

  const tableColumns = useMemo(
    () =>
      columnsForCategory(
        category,
        metricsAvailable,
        showNamespaceColumn,
      ),
    [category, metricsAvailable, showNamespaceColumn],
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

  const clusterPortForwards = useMemo(
    () =>
      cluster
        ? portForwards.filter((pf) => pf.cluster_id === cluster.id)
        : [],
    [portForwards, cluster],
  );

  const resourcePortForwards = useMemo(() => {
    if (!selectedResource) return [];
    return clusterPortForwards.filter(
      (pf) =>
        pf.name === selectedResource.name &&
        pf.namespace === selectedResource.namespace &&
        pf.resource_kind.toLowerCase() ===
          selectedResource.kind.toLowerCase(),
    );
  }, [clusterPortForwards, selectedResource]);

  const forwardablePorts = useMemo(() => {
    if (!selectedResource || !canPortForward(selectedResource.kind)) return [];
    const yaml =
      detail &&
      detail.kind.toLowerCase() === selectedResource.kind.toLowerCase() &&
      detail.namespace === selectedResource.namespace &&
      detail.name === selectedResource.name
        ? detail.yaml
        : "";
    return parseForwardablePorts(yaml, selectedResource.kind);
  }, [detail, selectedResource]);

  const podVolumeGroups = useMemo(() => {
    if (!selectedResource || selectedResource.kind !== "Pod") return [];
    const yaml =
      detail &&
      detail.kind.toLowerCase() === "pod" &&
      detail.namespace === selectedResource.namespace &&
      detail.name === selectedResource.name
        ? detail.yaml
        : "";
    return parsePodVolumes(yaml);
  }, [detail, selectedResource]);

  useEffect(() => {
    if (!selectedResource || forwardablePorts.length === 0) return;
    const used = resourcePortForwards.map((pf) => pf.local_port);
    setPfLocalByRow((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of forwardablePorts) {
        const key = portRowKey(p);
        if (next[key] != null && next[key] !== "") continue;
        next[key] = String(suggestLocalPort(p.remotePort, used));
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [forwardablePorts, resourcePortForwards, selectedResource]);

  if (!cluster) {
    return (
      <div className="k8s-workbench-empty">
        <p>{t("selectClusterHint")}</p>
        <button
          type="button"
          className="find-panel-run primary"
          onClick={() => setAddClusterOpen(true)}
        >
          {t("emptyClustersAdd")}
        </button>
      </div>
    );
  }

  const runDelete = async (row: K8sResourceRow): Promise<boolean> => {
    try {
      if (row.kind === "HelmRelease") {
        const res = await k8sHelmUninstall(cluster, row.name, row.namespace);
        if (res.ok) {
          pushToast(t("helmUninstallOk"), true);
          void refreshResources();
          return true;
        }
        pushOpError(
          "delete",
          res.error || res.stderr || t("helmUninstallFailed"),
        );
        return false;
      }
      const res = await k8sDeleteResource(
        cluster,
        row.kind,
        row.namespace,
        row.name,
      );
      if (res.ok) {
        const owner = ownedPodDeleteController(
          row.kind,
          ownerRefsForRow(row, detail),
        );
        pushToast(
          owner
            ? t("deleteOkControllerWillRecreate", {
                owner: `${owner.kind}/${owner.name}`,
              })
            : t("deleteOk"),
          true,
        );
        void refreshResources();
        return true;
      }
      pushOpError("delete", res.error || res.stderr || t("deleteFailed"));
      return false;
    } catch (err) {
      pushOpError("delete", formatAppError(err));
      return false;
    }
  };

  const runApply = async () => {
    try {
      const res = await k8sApplyYaml(cluster, yamlDraft);
      if (res.ok) {
        pushToast(t("applyOk"), true);
        void refreshResources();
      } else {
        pushOpError("apply", res.error || res.stderr || t("applyFailed"));
      }
    } catch (err) {
      pushOpError("apply", formatAppError(err));
    }
  };

  const openLogs = async (row: K8sResourceRow) => {
    setLogsLoading(true);
    setLogs("");
    setDetailTab("logs");
    try {
      const isPod = row.kind === "Pod";
      const containers = isPod
        ? await k8sPodContainers(cluster, row.namespace, row.name).catch(
            () => [] as string[],
          )
        : [];
      setLogsContainers(containers);
      const container = containers[0] ?? "";
      setLogsContainer(container);
      setLogsTarget({
        namespace: row.namespace,
        name: row.name,
        kind: row.kind,
      });
      const text = await k8sPodLogs(
        cluster,
        row.namespace,
        row.name,
        container || null,
        logsTail,
        row.kind,
      );
      setLogs(text);
      setLogsFollow(true);
    } catch (err) {
      pushToast(formatAppError(err), false);
    } finally {
      setLogsLoading(false);
    }
  };

  const fetchLogs = async (
    target: { namespace: string; name: string; kind: string },
    container: string,
  ) => {
    setLogsLoading(true);
    try {
      const text = await k8sPodLogs(
        cluster,
        target.namespace,
        target.name,
        container || null,
        logsTail,
        target.kind,
      );
      setLogs(text);
    } catch (err) {
      pushToast(formatAppError(err), false);
    } finally {
      setLogsLoading(false);
    }
  };

  const runSshPodShell = async (
    row: K8sResourceRow,
    containerOverride?: string | null,
  ): Promise<boolean> => {
    if (!cluster.session_id) return false;
    const container =
      containerOverride !== undefined
        ? containerOverride
        : shellContainer || null;
    try {
      const cmd = await k8sPodShellCommand(
        cluster,
        row.namespace,
        row.name,
        container,
      );
      setActiveTab(cluster.session_id);
      setSidebarView("hosts");
      await invoke("terminal_input", {
        sessionId: cluster.session_id,
        data: `${cmd}\n`,
      });
      pushToast(t("podShellOpened"), true);
      return true;
    } catch (err) {
      pushOpError("shell", formatAppError(err) || t("podShellFailed"));
      return false;
    }
  };

  const preparePodShell = async (row: K8sResourceRow) => {
    setShellPrepError(null);
    setShellMode("pod");
    setDetailTab("shell");
    try {
      const containers = await k8sPodContainers(
        cluster,
        row.namespace,
        row.name,
      ).catch(() => [] as string[]);
      const defaultContainer = containers[0] ?? "";
      setShellContainers(containers);
      setShellContainer(defaultContainer);
      if (
        selectedResource?.name !== row.name ||
        selectedResource.namespace !== row.namespace
      ) {
        await selectResource(row);
      }
      // SSH jump-host: single (or unknown) container → inject exec immediately.
      // Multi-container still needs an explicit pick + confirm.
      if (cluster.kind !== "kubeconfig" && containers.length <= 1) {
        const ok = await runSshPodShell(row, defaultContainer || null);
        if (!ok) {
          setShellPrepError(t("podShellFailed"));
        }
        return;
      }
      setShellSessionReady(true);
    } catch (err) {
      const msg = formatAppError(err) || t("podShellFailed");
      setShellPrepError(msg);
      setShellSessionReady(false);
      pushOpError("shell", msg);
    }
  };

  const prepareNodeShell = async (row: K8sResourceRow) => {
    setShellPrepError(null);
    setShellMode("node");
    setShellContainers([]);
    setShellContainer("");
    setDetailTab("shell");
    try {
      if (selectedResource?.name !== row.name || selectedResource.kind !== row.kind) {
        await selectResource(row);
      }
      setShellSessionReady(true);
    } catch (err) {
      const msg = formatAppError(err) || t("nodeShellFailed");
      setShellPrepError(msg);
      setShellSessionReady(false);
      pushOpError("shell", msg);
    }
  };

  const runSshNodeShell = async (row: K8sResourceRow) => {
    if (!cluster.session_id) return;
    try {
      const cmd = await k8sNodeShellCommand(cluster, row.name);
      setActiveTab(cluster.session_id);
      setSidebarView("hosts");
      await invoke("terminal_input", {
        sessionId: cluster.session_id,
        data: `${cmd}\n`,
      });
      pushToast(t("nodeShellOpened"), true);
    } catch (err) {
      pushOpError("shell", formatAppError(err) || t("nodeShellFailed"));
    }
  };

  const runCordon = async (row: K8sResourceRow) => {
    try {
      const result = await k8sCordonNode(cluster, row.name);
      if (!result.ok) throw new Error(result.error ?? result.stderr);
      pushToast(t("cordonOk", { name: row.name }), true);
      void refreshResources();
    } catch (err) {
      pushToast(formatAppError(err), false);
    }
  };

  const runUncordon = async (row: K8sResourceRow) => {
    try {
      const result = await k8sUncordonNode(cluster, row.name);
      if (!result.ok) throw new Error(result.error ?? result.stderr);
      pushToast(t("uncordonOk", { name: row.name }), true);
      void refreshResources();
    } catch (err) {
      pushToast(formatAppError(err), false);
    }
  };

  const runDrain = async (row: K8sResourceRow) => {
    try {
      const result = await k8sDrainNode(cluster, row.name);
      if (!result.ok) throw new Error(result.error ?? result.stderr);
      pushToast(t("drainOk", { name: row.name }), true);
      void refreshResources();
    } catch (err) {
      pushToast(formatAppError(err), false);
    }
  };

  const focusClusterTerminal = () => {
    if (cluster.kind === "ssh_kubectl" && cluster.session_id) {
      setActiveTab(cluster.session_id);
      setSidebarView("hosts");
      pushToast(t("terminalFocused"), true);
      return;
    }
    if (cluster.kind === "kubeconfig") {
      const next = openK8sTerminalDock(terminalTabs, t);
      setTerminalTabs(next.tabs);
      setActiveTerminalTabId(next.activeTabId);
      setDetailTab("clusterTerminal");
      return;
    }
    pushToast(t("terminalNeedSshBind"), false);
  };

  const openCreateResourceTab = () => {
    const id = `create-${Date.now()}`;
    setCreateResourceTabs((prev) => [
      ...prev,
      {
        id,
        title: t("dockCreateResourceTab", { n: prev.length + 1 }),
        yaml: defaultCreateResourceYaml(namespace),
        templateId: "ConfigMap",
      },
    ]);
    setActiveCreateResourceTabId(id);
    setDetailTab("createResource");
  };

  const runCreateResource = async (tabId: string) => {
    if (!cluster) return;
    const tab = createResourceTabs.find((entry) => entry.id === tabId);
    if (!tab) return;
    try {
      const res = await k8sApplyYaml(cluster, tab.yaml);
      if (res.ok) {
        pushToast(t("applyOk"), true);
        void refreshResources();
      } else {
        pushOpError("apply", res.error || res.stderr || t("applyFailed"));
      }
    } catch (err) {
      pushOpError("apply", formatAppError(err));
    }
  };

  const updateCreateResourceYaml = (tabId: string, yaml: string) => {
    setCreateResourceTabs((prev) =>
      prev.map((tab) => (tab.id === tabId ? { ...tab, yaml } : tab)),
    );
  };

  const updateCreateResourceTemplate = (
    tabId: string,
    templateId: K8sCreateTemplateId,
  ) => {
    setCreateResourceTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              templateId,
              yaml: createResourceYamlFromTemplate(templateId, namespace),
            }
          : tab,
      ),
    );
  };

  const startPortForward = async (localRaw: string, remoteRaw: string) => {
    if (!selectedResource || !canPortForward(selectedResource.kind)) return;
    const localPort = Number.parseInt(localRaw, 10);
    const remotePort = Number.parseInt(remoteRaw, 10);
    if (
      Number.isNaN(localPort) ||
      Number.isNaN(remotePort) ||
      localPort < 1 ||
      localPort > 65535 ||
      remotePort < 1 ||
      remotePort > 65535
    ) {
      pushToast(t("invalidPort"), false);
      return;
    }
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
    if (Number.isNaN(replicas) || replicas < 0) {
      pushToast(t("invalidReplicas"), false);
      return;
    }
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
      const ns =
        allNamespaces || selectedNamespaces.length !== 1
          ? null
          : selectedNamespaces[0] || namespace;
      const instances = await k8sListCrdInstances(cluster, plural, ns);
      setCrdBrowse({ plural, group, crdName: row.name });
      useK8sStore.setState({
        rows:
          !allNamespaces && selectedNamespaces.length > 1
            ? instances.filter((r) => selectedNamespaces.includes(r.namespace))
            : instances,
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

  const sendToChat = () => {
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

  const sendWarningToChat = (ev: K8sWarningEvent) => {
    if (!cluster) return;
    useAiEngineerStore
      .getState()
      .openK8sPanel(cluster.id, cluster.display_name, cluster);
    useAiEngineerStore.getState().setInput(
      k8sWarningChatPrompt(ev, (key, vars) => t(key, vars)),
    );
    useAiEngineerStore.getState().requestComposerFocus();
  };

  const sendLogsToChat = () => {
    if (!cluster || !selectedResource) return;
    useAiEngineerStore
      .getState()
      .openK8sPanel(cluster.id, cluster.display_name, cluster);
    useAiEngineerStore.getState().setInput(
      k8sLogsChatPrompt({
        kind: selectedResource.kind,
        namespace: selectedResource.namespace,
        name: selectedResource.name,
        container: logsContainer,
        logs,
        t: (key, vars) => t(key, vars),
      }),
    );
    useAiEngineerStore.getState().requestComposerFocus();
  };

  const sendYamlToChat = () => {
    if (!cluster || !selectedResource) return;
    useAiEngineerStore
      .getState()
      .openK8sPanel(cluster.id, cluster.display_name, cluster);
    useAiEngineerStore.getState().setInput(
      k8sYamlChatPrompt({
        kind: selectedResource.kind,
        namespace: selectedResource.namespace,
        name: selectedResource.name,
        yaml: yamlDraft,
        t: (key, vars) => t(key, vars),
      }),
    );
    useAiEngineerStore.getState().requestComposerFocus();
  };

  const sendHealthToChat = () => {
    if (!cluster || !clusterSummary) return;
    useAiEngineerStore
      .getState()
      .openK8sPanel(cluster.id, cluster.display_name, cluster);
    useAiEngineerStore.getState().setInput(
      k8sHealthChatPrompt({
        warnings: clusterSummary.recent_warnings,
        notReadyNodes:
          clusterSummary.node_count - clusterSummary.ready_node_count,
        t: (key, vars) => t(key, vars),
      }),
    );
    useAiEngineerStore.getState().requestComposerFocus();
  };

  const sendSelectionToChat = (text: string, source = "cluster-terminal") => {
    if (!cluster) return;
    useAiEngineerStore
      .getState()
      .openK8sPanel(cluster.id, cluster.display_name, cluster);
    useAiEngineerStore.getState().setInput(
      k8sSelectionChatPrompt({
        source,
        text,
        t: (key, vars) => t(key, vars),
      }),
    );
    useAiEngineerStore.getState().requestComposerFocus();
  };

  const resourceTabLabel = (row: K8sResourceRow) =>
    row.namespace
      ? `${row.kind} · ${row.namespace}/${row.name}`
      : `${row.kind} · ${row.name}`;

  const iconCategoryForKind = (kind: string) => {
    if (kind === "HelmRelease") return "helm_releases" as const;
    if (kind === "HelmChart") return "helm_charts" as const;
    return categoryForKind(kind) ?? ("pods" as const);
  };

  const selectedRow = selectedResource
    ? rows.find(
        (r) =>
          r.name === selectedResource.name &&
          r.namespace === selectedResource.namespace &&
          r.kind === selectedResource.kind,
      ) ?? null
    : null;

  const renderResourceQuickActions = () => {
    if (!selectedResource) return null;
    if (detailTab === "clusterTerminal" || detailTab === "createResource") {
      return null;
    }
    const row = {
      kind: selectedResource.kind,
      namespace: selectedResource.namespace,
      name: selectedResource.name,
      unschedulable: selectedRow?.unschedulable,
    };
    return (
      <div className="k8s-detail-quick-actions">
        <button
          type="button"
          className="k8s-detail-quick-btn"
          title={t("copyName")}
          aria-label={t("copyName")}
          onClick={() => void copyResourceName(selectedResource.name)}
        >
          <Copy size={13} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="k8s-detail-quick-btn primary"
          title={t("terminal:sendToChat")}
          aria-label={t("terminal:sendToChat")}
          onClick={sendToChat}
        >
          <MessageSquare size={13} strokeWidth={2} />
        </button>
        {canScale(selectedResource.kind) ? (
          <button
            type="button"
            className="k8s-detail-quick-btn"
            title={t("scale")}
            aria-label={t("scale")}
            data-testid="k8s-action-scale"
            onClick={() => {
              setScaleReplicas(parseScaleReplicas(detail, selectedRow));
              setConfirm({ kind: "scale" });
            }}
          >
            <Scaling size={13} strokeWidth={2} />
          </button>
        ) : null}
        {canRestart(selectedResource.kind) ? (
          <button
            type="button"
            className="k8s-detail-quick-btn"
            title={t("restart")}
            aria-label={t("restart")}
            data-testid="k8s-action-restart"
            onClick={() => setConfirm({ kind: "restart", row })}
          >
            <RotateCw size={13} strokeWidth={2} />
          </button>
        ) : null}
        {canPortForward(selectedResource.kind) ? (
          <button
            type="button"
            className="k8s-detail-quick-btn"
            title={t("portForward")}
            aria-label={t("portForward")}
            data-testid="k8s-action-port-forward"
            onClick={() => {
              setPfLocal("8080");
              setPfRemote("80");
              setDetailTab("portForward");
            }}
          >
            <ArrowLeftRight size={13} strokeWidth={2} />
          </button>
        ) : null}
        {canNodeShell(selectedResource.kind) && !row.unschedulable ? (
          <button
            type="button"
            className="k8s-detail-quick-btn"
            title={t("actionCordon")}
            aria-label={t("actionCordon")}
            data-testid="k8s-action-cordon"
            onClick={() => setConfirm({ kind: "cordon", row })}
          >
            <Ban size={13} strokeWidth={2} />
          </button>
        ) : null}
        {canNodeShell(selectedResource.kind) && row.unschedulable ? (
          <button
            type="button"
            className="k8s-detail-quick-btn"
            title={t("actionUncordon")}
            aria-label={t("actionUncordon")}
            data-testid="k8s-action-uncordon"
            onClick={() => setConfirm({ kind: "uncordon", row })}
          >
            <CircleCheck size={13} strokeWidth={2} />
          </button>
        ) : null}
        {canNodeShell(selectedResource.kind) ? (
          <button
            type="button"
            className="k8s-detail-quick-btn"
            title={t("actionDrain")}
            aria-label={t("actionDrain")}
            data-testid="k8s-action-drain"
            onClick={() => setConfirm({ kind: "drain", row })}
          >
            <ArrowUp size={13} strokeWidth={2} />
          </button>
        ) : null}
        {selectedResource.kind === "HelmChart" ? (
          <button
            type="button"
            className="k8s-detail-quick-btn"
            title={t("helmInstall")}
            aria-label={t("helmInstall")}
            data-testid="k8s-action-helm-install"
            onClick={() => {
              const releaseGuess = selectedResource.name.includes("/")
                ? selectedResource.name.split("/").pop() || selectedResource.name
                : selectedResource.name;
              setHelmReleaseName(releaseGuess);
              setHelmNamespace(namespace || "default");
              setHelmValues("");
              void k8sHelmChartValues(cluster, selectedResource.name)
                .then((v) => setHelmValues(v))
                .catch(() => setHelmValues(""));
              setConfirm({ kind: "helmInstall", chart: selectedResource.name });
            }}
          >
            <Package size={13} strokeWidth={2} />
          </button>
        ) : null}
        {selectedResource.kind === "HelmRelease" ? (
          <>
            <button
              type="button"
              className="k8s-detail-quick-btn"
              title={t("helmUpgrade")}
              aria-label={t("helmUpgrade")}
              data-testid="k8s-action-helm-upgrade"
              onClick={() => {
                setHelmNamespace(selectedResource.namespace || "default");
                setHelmValues("");
                void k8sHelmGetValues(
                  cluster,
                  selectedResource.namespace,
                  selectedResource.name,
                )
                  .then((v) => setHelmValues(v))
                  .catch(() => setHelmValues(""));
                setConfirm({ kind: "helmUpgrade", row });
              }}
            >
              <ArrowUp size={13} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="k8s-detail-quick-btn"
              title={t("helmRollback")}
              aria-label={t("helmRollback")}
              data-testid="k8s-action-helm-rollback"
              onClick={() => setConfirm({ kind: "helmRollback", row })}
            >
              <Undo2 size={13} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="k8s-detail-quick-btn danger"
              title={t("helmUninstall")}
              aria-label={t("helmUninstall")}
              data-testid="k8s-action-helm-uninstall"
              onClick={() => setConfirm({ kind: "helmUninstall", row })}
            >
              <Trash2 size={13} strokeWidth={2} />
            </button>
          </>
        ) : null}
        {selectedResource.kind === "Namespace" ? (
          <button
            type="button"
            className="k8s-detail-quick-btn"
            title={t("useNamespace")}
            aria-label={t("useNamespace")}
            data-testid="k8s-action-use-namespace"
            onClick={() => setNamespace(selectedResource.name)}
          >
            <CircleCheck size={13} strokeWidth={2} />
          </button>
        ) : null}
        {selectedResource.kind === "CustomResourceDefinition" && selectedRow ? (
          <button
            type="button"
            className="k8s-detail-quick-btn"
            title={t("listCrdInstances")}
            aria-label={t("listCrdInstances")}
            data-testid="k8s-action-crd-instances"
            onClick={() => void listCrdInstances(selectedRow)}
          >
            <ListTree size={13} strokeWidth={2} />
          </button>
        ) : null}
        {selectedResource.kind !== "HelmRelease" &&
        selectedResource.kind !== "HelmChart" ? (
          <button
            type="button"
            className="k8s-detail-quick-btn danger"
            title={t("delete")}
            aria-label={t("delete")}
            data-testid="k8s-action-delete"
            onClick={() => {
              const row = {
                kind: selectedResource.kind,
                namespace: selectedResource.namespace,
                name: selectedResource.name,
              };
              if (row.kind !== "Pod") {
                setConfirm({ kind: "delete", row });
                return;
              }
              void resolveOwnedPodDeleteTarget(cluster, row, detail).then(
                (owner) => {
                  setConfirm({ kind: "delete", row, owner });
                },
              );
            }}
          >
            <Trash2 size={13} strokeWidth={2} />
          </button>
        ) : null}
      </div>
    );
  };

  const handleWarningClick = (ev: K8sWarningEvent) => {
    if (!ev.kind?.trim() || !ev.name?.trim()) {
      pushToast(t("warningNavigateNoKind"), false);
      return;
    }
    void navigateToResource({
      kind: ev.kind,
      namespace: ev.namespace,
      name: ev.name,
    }).catch((err) => pushToast(formatAppError(err), false));
  };

  const toolsErrorBanner =
    error === "kubectl_missing" ||
    error === "helm_missing" ||
    Boolean(
      error &&
        /kubectl not found|does not bundle kubectl|kubectl failed to start|Use Install kubectl|helm not found|Use Install Helm/i.test(
          error,
        ),
    );

  const hasSessionTabs =
    terminalTabs.length > 0 || createResourceTabs.length > 0;

  const showDetailPanel =
    hasSessionTabs ||
    selectedResource != null ||
    openResources.length > 0;


  const fallbackDetailTab = (): typeof detailTab => {
    if (terminalTabs.length > 0) return "clusterTerminal";
    if (createResourceTabs.length > 0) return "createResource";
    return "overview";
  };

  const closeTerminalTab = (tabId: string) => {
    const idx = terminalTabs.findIndex((tab) => tab.id === tabId);
    const next = terminalTabs.filter((tab) => tab.id !== tabId);
    setTerminalTabs(next);
    if (activeTerminalTabId === tabId) {
      const fallback = next[Math.max(0, idx - 1)]?.id ?? null;
      setActiveTerminalTabId(fallback);
      if (!fallback && detailTab === "clusterTerminal") {
        setDetailTab(fallbackDetailTab());
      }
    }
  };

  const closeCreateResourceTab = (tabId: string) => {
    const idx = createResourceTabs.findIndex((tab) => tab.id === tabId);
    const next = createResourceTabs.filter((tab) => tab.id !== tabId);
    setCreateResourceTabs(next);
    if (activeCreateResourceTabId === tabId) {
      const fallback = next[Math.max(0, idx - 1)]?.id ?? null;
      setActiveCreateResourceTabId(fallback);
      if (!fallback && detailTab === "createResource") {
        setDetailTab(fallbackDetailTab());
      }
    }
  };

  const selectCreateResourceTab = (tabId: string) => {
    setActiveCreateResourceTabId(tabId);
    setDetailTab("createResource");
  };

  const createResourceTabRow =
    createResourceTabs.length > 0 ? (
      <K8sCreateResourceTabs
        tabs={createResourceTabs}
        activeTabId={activeCreateResourceTabId}
        detailTabActive={detailTab === "createResource"}
        onSelectTab={selectCreateResourceTab}
        onCloseTab={closeCreateResourceTab}
      />
    ) : null;

  const selectTerminalTab = (tabId: string) => {
    setActiveTerminalTabId(tabId);
    setDetailTab("clusterTerminal");
  };

  const clusterTerminalTabs =
    terminalTabs.length > 0 ? (
      <K8sClusterTerminalTabs
        tabs={terminalTabs}
        activeTabId={activeTerminalTabId}
        detailTabActive={detailTab === "clusterTerminal"}
        onSelectTab={selectTerminalTab}
        onCloseTab={closeTerminalTab}
      />
    ) : null;

  const navSessionFooter =
    cluster.kind === "kubeconfig" || cluster.kind === "ssh_kubectl" ? (
      <div className="k8s-tree-footer" data-testid="k8s-nav-session-actions">
        <span className="k8s-tree-footer-spacer" aria-hidden />
        <button
          type="button"
          className="k8s-tree-footer-btn"
          data-testid="k8s-nav-terminal"
          title={t("openTerminal")}
          aria-label={t("openTerminal")}
          onClick={focusClusterTerminal}
        >
          <Terminal size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="k8s-tree-footer-btn"
          data-testid="k8s-nav-create-resource"
          title={t("dockCreateResource")}
          aria-label={t("dockCreateResource")}
          onClick={openCreateResourceTab}
        >
          <FilePlus size={14} strokeWidth={2} />
        </button>
      </div>
    ) : null;

  return (
    <>
    <WorkbenchShell
      className="k8s-workbench"
      detailResizable={showDetailPanel}
      statusBar={
        clusterPortForwards.length > 0 ? (
          <div className="k8s-status-bar" role="status">
            <div className="k8s-pf-bar">
              {clusterPortForwards.map((pf) => (
                <span key={pf.id} className="k8s-pf-chip">
                  <button
                    type="button"
                    className="k8s-pf-chip-label"
                    title={`${pf.resource_kind} · ${pf.namespace ? `${pf.namespace}/` : ""}${pf.name}`}
                    onClick={() =>
                      void navigateToResource({
                        kind: pf.resource_kind,
                        namespace: pf.namespace,
                        name: pf.name,
                      }).catch((err) => pushToast(formatAppError(err), false))
                    }
                  >
                    {pf.resource_kind}/{pf.namespace ? `${pf.namespace}/` : ""}
                    {pf.name} · {pf.local_port}→{pf.remote_port}
                    {pf.mode === "ssh_remote" ? " (SSH)" : ""}
                  </button>
                  <button
                    type="button"
                    aria-label={t("portForwardStop")}
                    title={t("portForwardStop")}
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
          </div>
        ) : null
      }
      leftNav={(
        <nav className="k8s-tree" aria-label={t("resourceTree")}>
          <div className="k8s-tree-body">
          {navGroups.map((group) => {
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
                        className={`k8s-tree-item${category === c && !crdBrowse ? " active" : ""}`}
                        onClick={() => selectCategory(c)}
                      >
                        <span>{t(`category.${c}`)}</span>
                      </button>
                    ))}
                    {group.id === "custom" ? (
                      <K8sCrdNavTree
                        catalog={crdCatalog}
                        loading={crdCatalogLoading}
                        expandedGroups={expandedCrdGroups}
                        activeBrowse={crdBrowse}
                        onToggleGroup={toggleCrdGroup}
                        onSelectCrd={selectCrdEntry}
                        onSelectDefinitions={selectCrdDefinitions}
                        definitionsActive={
                          category === "customresourcedefinitions" && !crdBrowse
                        }
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          </div>
          {navSessionFooter}
        </nav>
      )}
      main={(
        <section className="k8s-table-panel">
          {jumpHostGate && category !== "cluster_overview" ? jumpHostBanner : null}
          {category === "cluster_overview" ? (
            <div className="k8s-table-scroll">
              {jumpHostGate ? (
                jumpHostBanner
              ) : toolsErrorBanner ? (
                <div className="k8s-tools-banner" role="alert">
                  <span>
                    {error === "helm_missing"
                      ? t("helmNotFoundSidebar")
                      : t("kubectlNotFoundSidebar")}
                  </span>
                </div>
              ) : error ? (
                <p className="k8s-error">{error}</p>
              ) : (
              <K8sClusterSummaryView
                summary={clusterSummary}
                loading={clusterSummaryLoading}
                onWarningClick={handleWarningClick}
                onWarningSendToChat={sendWarningToChat}
                onHealthSendToChat={sendHealthToChat}
                onRefresh={() => void refreshClusterSummary()}
              />
              )}
            </div>
          ) : (
            <>
          <div className="k8s-table-toolbar">
            {!isClusterScoped ? (
              <K8sNamespacePicker
                namespaces={namespaces}
                allNamespaces={allNamespaces}
                selectedNamespaces={selectedNamespaces}
                namespace={namespace}
                allLabel={t("allNamespaces")}
                searchPlaceholder={t("namespaceSearch")}
                aria-label={t("namespace")}
                onChange={applyNamespaceSelection}
              />
            ) : null}
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
              {category === "helm_charts" ? (
                <button
                  type="button"
                  className="find-panel-run"
                  onClick={() => {
                    setHelmRepoName("");
                    setHelmRepoUrl("");
                    setConfirm({ kind: "helmRepoAdd" });
                  }}
                >
                  {t("helmAddRepo")}
                </button>
              ) : null}
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
          {!loading && !error && filteredRows.length === 0 ? (
            <p className="k8s-detail-empty">
              {tableFilter.trim()
                ? t("tableEmptyFiltered")
                : category === "helm_charts"
                  ? t("helmChartsEmptyHint")
                  : t("tableEmpty")}
            </p>
          ) : null}
          {filteredRows.length > 0 ? (
          <table className="k8s-table">
            <thead>
              <tr>
                {tableColumns.map((col) => (
                  <th key={col.id} className={col.className}>
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
                    <td key={col.id} className={col.className}>
                      {col.cell(row)}
                    </td>
                  ))}
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
          <aside className="k8s-detail-panel">
            <>
              <div className="k8s-detail-session-bar">
                <div className="k8s-detail-tabs" role="tablist" data-testid="k8s-detail-tablist">
                {createResourceTabRow}
                {clusterTerminalTabs}
                {openResources.map((row) => {
                  const resourceSelected =
                    selectedResource?.name === row.name &&
                    selectedResource.namespace === row.namespace &&
                    selectedResource.kind === row.kind;
                  const active =
                    resourceSelected &&
                    detailTab !== "clusterTerminal" &&
                    detailTab !== "createResource";
                  return (
                    <button
                      key={`${row.kind}/${row.namespace}/${row.name}`}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`k8s-detail-tab--resource${active ? " active" : ""}`}
                      title={resourceTabLabel(row)}
                      data-testid={`k8s-resource-tab-${row.kind}-${row.namespace || "_"}-${row.name}`}
                      onClick={() => {
                        setDetailTab("overview");
                        void selectResource(row);
                      }}
                    >
                      <K8sCategoryIcon category={iconCategoryForKind(row.kind)} size={12} />
                      <span className="k8s-detail-tab-label">{resourceTabLabel(row)}</span>
                      <span
                        className="k8s-detail-terminal-tab-close"
                        role="button"
                        tabIndex={0}
                        aria-label={t("common:close")}
                        onClick={(e) => {
                          e.stopPropagation();
                          closeResourceTab(row);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            closeResourceTab(row);
                          }
                        }}
                      >
                        <X size={12} strokeWidth={2} />
                      </span>
                    </button>
                  );
                })}
                </div>
              </div>
              {selectedResource &&
              detailTab !== "clusterTerminal" &&
              detailTab !== "createResource" ? (
                <div className="k8s-detail-resource-bar">
                  <div
                    className="k8s-detail-sub-tabs"
                    role="tablist"
                    data-testid="k8s-detail-sub-tablist"
                  >
                    <button
                      type="button"
                      role="tab"
                      className={detailTab === "overview" ? "active" : ""}
                      onClick={() => setDetailTab("overview")}
                    >
                      {t("detailOverview")}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={detailTab === "yaml" ? "active" : ""}
                      onClick={() => setDetailTab("yaml")}
                    >
                      {selectedResource.kind === "HelmRelease"
                        ? t("detailValues")
                        : t("detailYaml")}
                    </button>
                    {canLogs(selectedResource.kind) ? (
                      <button
                        type="button"
                        role="tab"
                        className={detailTab === "logs" ? "active" : ""}
                        onClick={() =>
                          void openLogs({
                            kind: selectedResource.kind,
                            namespace: selectedResource.namespace,
                            name: selectedResource.name,
                          })
                        }
                      >
                        {t("logs")}
                      </button>
                    ) : null}
                    {canShell(selectedResource.kind) ? (
                      <button
                        type="button"
                        role="tab"
                        className={detailTab === "shell" ? "active" : ""}
                        onClick={() => {
                          const row = {
                            kind: selectedResource.kind,
                            namespace: selectedResource.namespace,
                            name: selectedResource.name,
                          };
                          // kubeconfig: reuse embedded PTY once ready.
                          // SSH: always prepare — single-container auto-enters the bound terminal.
                          if (
                            cluster.kind === "kubeconfig" &&
                            shellSessionReady
                          ) {
                            setDetailTab("shell");
                            return;
                          }
                          void preparePodShell(row);
                        }}
                      >
                        {t("podShell")}
                      </button>
                    ) : null}
                    {canPortForward(selectedResource.kind) ? (
                      <button
                        type="button"
                        role="tab"
                        className={detailTab === "portForward" ? "active" : ""}
                        data-testid="k8s-detail-tab-port-forward"
                        onClick={() => {
                          setPfLocal("8080");
                          setPfRemote("80");
                          setDetailTab("portForward");
                        }}
                      >
                        {t("portForward")}
                      </button>
                    ) : null}
                    {canNodeShell(selectedResource.kind) ? (
                      <button
                        type="button"
                        role="tab"
                        className={detailTab === "shell" ? "active" : ""}
                        onClick={() =>
                          shellSessionReady && shellMode === "node"
                            ? setDetailTab("shell")
                            : void prepareNodeShell({
                                kind: selectedResource.kind,
                                namespace: selectedResource.namespace,
                                name: selectedResource.name,
                              })
                        }
                      >
                        {t("nodeShell")}
                      </button>
                    ) : null}
                  </div>
                  {renderResourceQuickActions()}
                </div>
              ) : null}

              {terminalTabs.length > 0 ? (
                <K8sClusterTerminalPanes
                  cluster={cluster}
                  tabs={terminalTabs}
                  activeTabId={activeTerminalTabId}
                  visible={detailTab === "clusterTerminal"}
                  onCloseTab={closeTerminalTab}
                  onError={handleShellError}
                  onSendSelection={(text) =>
                    sendSelectionToChat(text, "cluster-terminal")
                  }
                />
              ) : null}

              <K8sCreateResourcePanes
                tabs={createResourceTabs}
                activeTabId={activeCreateResourceTabId}
                visible={detailTab === "createResource"}
                onYamlChange={updateCreateResourceYaml}
                onTemplateChange={updateCreateResourceTemplate}
                onApply={(tabId) => void runCreateResource(tabId)}
              />

              <div
                className="k8s-detail-pane-slot k8s-detail-resource-body"
                hidden={
                  detailTab === "clusterTerminal" ||
                  detailTab === "createResource" ||
                  !selectedResource
                }
              >
              {selectedResource &&
              canPortForward(selectedResource.kind) &&
              detailTab === "portForward" ? (
                <div
                  className="k8s-detail-tab-body k8s-detail-port-forward-pane"
                  data-testid="k8s-port-forward-pane"
                >
                  {forwardablePorts.length === 0 ? (
                    <p className="k8s-detail-empty k8s-port-forward-empty">
                      {t("portForwardEmpty")}
                    </p>
                  ) : (
                    <ul className="k8s-port-forward-rows">
                      {forwardablePorts.map((port) => {
                        const key = portRowKey(port);
                        const active = findActiveForward(resourcePortForwards, {
                          resourceKind: selectedResource.kind,
                          namespace: selectedResource.namespace,
                          name: selectedResource.name,
                          remotePort: port.remotePort,
                        });
                        const localDraft =
                          pfLocalByRow[key] ??
                          String(
                            suggestLocalPort(
                              port.remotePort,
                              resourcePortForwards.map((pf) => pf.local_port),
                            ),
                          );
                        return (
                          <li
                            key={key}
                            className="k8s-port-forward-row"
                            data-testid={`k8s-port-forward-row-${port.remotePort}`}
                          >
                            <div className="k8s-port-forward-row-meta">
                              <span className="k8s-port-forward-remote">
                                {port.remotePort}/{port.protocol}
                              </span>
                              {port.name ? (
                                <span className="k8s-port-forward-name">
                                  {port.name}
                                </span>
                              ) : null}
                              {port.targetPort ? (
                                <span className="k8s-port-forward-target">
                                  → {port.targetPort}
                                </span>
                              ) : null}
                            </div>
                            {active ? (
                              <div className="k8s-port-forward-row-actions">
                                <span className="k8s-port-forward-active">
                                  localhost:{active.local_port}
                                </span>
                                <button
                                  type="button"
                                  className="k8s-refresh-btn"
                                  title={t("portForwardStop")}
                                  aria-label={t("portForwardStop")}
                                  data-testid={`k8s-port-forward-stop-${port.remotePort}`}
                                  onClick={() =>
                                    void k8sPortForwardStop(active.id)
                                      .then(() => {
                                        void refreshPortForwards();
                                        pushToast(t("portForwardStopped"), true);
                                      })
                                      .catch((err) =>
                                        pushToast(formatAppError(err), false),
                                      )
                                  }
                                >
                                  <X size={12} strokeWidth={2} />
                                </button>
                              </div>
                            ) : (
                              <div className="k8s-port-forward-row-actions">
                                <label className="k8s-port-forward-local-label">
                                  <input
                                    type="number"
                                    value={localDraft}
                                    aria-label={t("portForwardLocal")}
                                    onChange={(e) =>
                                      setPfLocalByRow((prev) => ({
                                        ...prev,
                                        [key]: e.target.value,
                                      }))
                                    }
                                    data-testid={`k8s-port-forward-local-${port.remotePort}`}
                                  />
                                </label>
                                <button
                                  type="button"
                                  className="find-panel-run primary"
                                  data-testid={`k8s-port-forward-start-${port.remotePort}`}
                                  onClick={() =>
                                    void startPortForward(
                                      localDraft,
                                      String(port.remotePort),
                                    )
                                  }
                                >
                                  {t("portForwardAction")}
                                </button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {resourcePortForwards
                    .filter(
                      (pf) =>
                        !forwardablePorts.some(
                          (p) => p.remotePort === pf.remote_port,
                        ),
                    )
                    .map((pf) => (
                      <div
                        key={pf.id}
                        className="k8s-port-forward-row k8s-port-forward-row--orphan"
                      >
                        <span>
                          localhost:{pf.local_port} → {pf.remote_port}
                        </span>
                        <button
                          type="button"
                          className="k8s-refresh-btn"
                          title={t("portForwardStop")}
                          aria-label={t("portForwardStop")}
                          onClick={() =>
                            void k8sPortForwardStop(pf.id)
                              .then(() => {
                                void refreshPortForwards();
                                pushToast(t("portForwardStopped"), true);
                              })
                              .catch((err) =>
                                pushToast(formatAppError(err), false),
                              )
                          }
                        >
                          <X size={12} strokeWidth={2} />
                        </button>
                      </div>
                    ))}
                  <div className="k8s-detail-action-pane k8s-port-forward-custom">
                    <p className="k8s-port-forward-custom-title">
                      {t("portForwardCustom")}
                    </p>
                    <label>
                      {t("portForwardLocal")}
                      <input
                        type="number"
                        value={pfLocal}
                        onChange={(e) => setPfLocal(e.target.value)}
                        data-testid="k8s-port-forward-local"
                      />
                    </label>
                    <label>
                      {t("portForwardRemote")}
                      <input
                        type="number"
                        value={pfRemote}
                        onChange={(e) => setPfRemote(e.target.value)}
                        data-testid="k8s-port-forward-remote"
                      />
                    </label>
                    <button
                      type="button"
                      className="find-panel-run primary"
                      data-testid="k8s-port-forward-start"
                      onClick={() => void startPortForward(pfLocal, pfRemote)}
                    >
                      {t("portForwardStart")}
                    </button>
                  </div>
                </div>
              ) : detailLoading ? (
                  <p>{t("loading")}</p>
                ) : detailError ? (
            <div className="k8s-detail-empty">
              <p className="k8s-error">{detailError === "kubectl_missing" || detailError === "helm_missing" ? (detailError === "helm_missing" ? t("helmNotFoundSidebar") : t("kubectlNotFoundSidebar")) : detailError}</p>
              <button
                type="button"
                className="find-panel-run"
                onClick={() =>
                  void selectResource({
                    kind: selectedResource!.kind,
                    namespace: selectedResource!.namespace,
                    name: selectedResource!.name,
                  })
                }
              >
                {t("refresh")}
              </button>
            </div>
                ) : detail ? (
                  <>
              <div hidden={detailTab !== "overview"}>
                {(() => {
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
                  const empty =
                    groups.status.length === 0 &&
                    groups.meta.length === 0 &&
                    groups.other.length === 0 &&
                    podVolumeGroups.length === 0;
                  return (
                    <div className="k8s-detail-overview">
                      {empty ? (
                        <p className="k8s-detail-empty">{t("overviewEmpty")}</p>
                      ) : null}
                      {renderGroup(t("overviewStatus"), groups.status)}
                      {renderGroup(t("overviewMeta"), groups.meta)}
                      {renderGroup(t("overviewOther"), groups.other)}
                      {podVolumeGroups.length > 0 ? (
                        <section
                          className="k8s-overview-group k8s-overview-volumes"
                          data-testid="k8s-overview-volumes"
                        >
                          <h4>{t("overviewVolumes")}</h4>
                          <ul className="k8s-overview-volume-list">
                            {podVolumeGroups.map((group) => (
                              <li
                                key={group.typeKey}
                                data-testid={`k8s-overview-volume-group-${group.typeKey}`}
                              >
                                <details>
                                  <summary>
                                    <span className="k8s-overview-volume-type">
                                      {t(volumeTypeI18nKey(group.typeKey), {
                                        defaultValue: group.typeKey,
                                      })}
                                    </span>
                                    <span className="k8s-overview-volume-count">
                                      {t("overviewVolumeCount", {
                                        count: group.volumes.length,
                                      })}
                                    </span>
                                  </summary>
                                  <ul className="k8s-overview-volume-items">
                                    {group.volumes.map((vol) => {
                                      const meta = [
                                        vol.claimName,
                                        vol.mountPaths.length > 0
                                          ? vol.mountPaths.join(", ")
                                          : null,
                                      ]
                                        .filter(Boolean)
                                        .join(" · ");
                                      return (
                                      <li key={vol.name}>
                                        <span className="k8s-overview-volume-name">
                                          {vol.name}
                                        </span>
                                        {meta ? (
                                          <span
                                            className="k8s-overview-volume-meta"
                                            title={meta}
                                          >
                                            {meta}
                                          </span>
                                        ) : null}
                                      </li>
                                      );
                                    })}
                                  </ul>
                                </details>
                              </li>
                            ))}
                          </ul>
                        </section>
                      ) : null}
                    </div>
                  );
                })()}
              </div>

              <div hidden={detailTab !== "yaml"} className="k8s-detail-tab-body k8s-detail-yaml-pane">
                  <div className="k8s-detail-logs-toolbar">
                    <button
                      type="button"
                      className="k8s-refresh-btn"
                      title={t("sendYamlToChat")}
                      aria-label={t("sendYamlToChat")}
                      data-testid="k8s-yaml-send-chat"
                      disabled={!yamlDraft.trim()}
                      onClick={sendYamlToChat}
                    >
                      <MessageSquare size={14} strokeWidth={2} />
                    </button>
                    {detail.kind !== "HelmRelease" ? (
                      <button
                        type="button"
                        className="k8s-refresh-btn"
                        title={t("apply")}
                        aria-label={t("apply")}
                        data-testid="k8s-yaml-apply"
                        disabled={!yamlDraft.trim()}
                        onClick={() => setConfirm({ kind: "apply" })}
                      >
                        <Save size={14} strokeWidth={2} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={`k8s-refresh-btn${yamlFindOpen ? " active" : ""}`}
                      title={t("yamlFind")}
                      aria-label={t("yamlFind")}
                      data-testid="k8s-yaml-find"
                      onClick={() => setYamlFindOpen((open) => !open)}
                    >
                      <Search size={14} strokeWidth={2} />
                    </button>
                  </div>
                  <K8sYamlEditor
                    value={yamlDraft}
                    onChange={setYamlDraft}
                    readOnly={detail.kind === "HelmRelease"}
                    findOpen={yamlFindOpen}
                    onFindOpenChange={setYamlFindOpen}
                    testId="k8s-resource-yaml-editor"
                    ariaLabel={t("detailYaml")}
                  />
              </div>

              <div hidden={detailTab !== "logs"} className="k8s-detail-tab-body k8s-detail-logs">
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
                    <label>{t("logsTail")}<input type="number" min={50} max={5000} value={logsTail} onChange={(e) => setLogsTail(Number.parseInt(e.target.value, 10) || 200)} onBlur={() => { if (logsTarget && !logsFollow) void fetchLogs(logsTarget, logsContainer); }} /></label>
                    <label><input type="checkbox" checked={logsFollow} onChange={(e) => setLogsFollow(e.target.checked)} />{t("logsFollow")}</label>
                    {!logsFollow && logsTarget ? (
                      <button
                        type="button"
                        className="k8s-refresh-btn"
                        title={t("refresh")}
                        aria-label={t("refresh")}
                        onClick={() => void fetchLogs(logsTarget, logsContainer)}
                      >
                        <RefreshCw size={14} strokeWidth={2} className={logsLoading ? "k8s-spin" : ""} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="k8s-refresh-btn"
                      title={t("sendLogsToChat")}
                      aria-label={t("sendLogsToChat")}
                      data-testid="k8s-logs-send-chat"
                      disabled={!logs.trim()}
                      onClick={sendLogsToChat}
                    >
                      <MessageSquare size={14} strokeWidth={2} />
                    </button>
                  </div>
                  <pre
                    className="k8s-logs-pre"
                    ref={logsPreRef}
                    data-testid="k8s-logs-pre"
                    onContextMenu={(e) => {
                      const sel = window.getSelection();
                      const text =
                        sel &&
                        !sel.isCollapsed &&
                        logsPreRef.current &&
                        sel.anchorNode &&
                        logsPreRef.current.contains(sel.anchorNode)
                          ? sel.toString()
                          : "";
                      if (!text.trim()) return;
                      e.preventDefault();
                      setLogsMenu({
                        x: e.clientX,
                        y: e.clientY,
                        text,
                      });
                    }}
                  >
                    {logsLoading && !logs
                      ? t("loading")
                      : logs || t("logsEmpty")}
                  </pre>
                  {logsMenu ? (
                    <K8sSelectionContextMenu
                      x={logsMenu.x}
                      y={logsMenu.y}
                      text={logsMenu.text}
                      testIdPrefix="k8s-logs"
                      onCopy={(text) => void copyToClipboard(text)}
                      onSendToChat={(text) =>
                        sendSelectionToChat(text, "logs")
                      }
                      onClose={() => setLogsMenu(null)}
                    />
                  ) : null}
              </div>

              {cluster.kind === "kubeconfig" &&
              shellSessionReady &&
              selectedResource &&
              ((shellMode === "pod" && canShell(selectedResource.kind)) ||
                (shellMode === "node" && canNodeShell(selectedResource.kind))) ? (
                <div
                  className="k8s-detail-tab-body k8s-detail-shell-pane"
                  hidden={detailTab !== "shell"}
                >
                  {shellMode === "pod" && shellContainers.length > 1 ? (
                    <div className="k8s-detail-logs-toolbar">
                      <DarkSelect
                        value={shellContainer}
                        onChange={(v) => setShellContainer(v)}
                        aria-label={t("shellContainer")}
                        options={shellContainers.map((c) => ({
                          value: c,
                          label: c,
                        }))}
                      />
                    </div>
                  ) : null}
                  <K8sPodShellTerminal
                    key={`${shellMode}/${selectedResource.namespace}/${selectedResource.name}/${shellContainer}`}
                    cluster={cluster}
                    mode={shellMode}
                    namespace={selectedResource.namespace}
                    pod={selectedResource.name}
                    container={shellContainer || null}
                    onError={handleShellError}
                    onSendSelection={(text) =>
                      sendSelectionToChat(text, "pod-shell")
                    }
                  />
                </div>
              ) : null}

              {detailTab === "shell" &&
              !(cluster.kind === "kubeconfig" && shellSessionReady) ? (
                <div className="k8s-detail-tab-body k8s-detail-shell-pane" hidden={detailTab !== "shell"}>
                  {cluster.kind === "kubeconfig" ? (
                    shellPrepError ? (
                      <div className="k8s-detail-empty">
                        <p className="k8s-error">{shellPrepError}</p>
                        <button
                          type="button"
                          className="find-panel-run"
                          onClick={() =>
                            void (shellMode === "node"
                              ? prepareNodeShell({
                                  kind: selectedResource!.kind,
                                  namespace: selectedResource!.namespace,
                                  name: selectedResource!.name,
                                })
                              : preparePodShell({
                                  kind: selectedResource!.kind,
                                  namespace: selectedResource!.namespace,
                                  name: selectedResource!.name,
                                }))
                          }
                        >
                          {t("refresh")}
                        </button>
                      </div>
                    ) : (
                      <p>{t("loading")}</p>
                    )
                  ) : (
                    <>
                      <p>
                        {shellMode === "node"
                          ? t("nodeShellSshHint")
                          : t("podShellSshHint")}
                      </p>
                      {shellMode === "pod" && shellContainers.length > 1 ? (
                        <div className="k8s-detail-logs-toolbar">
                          <DarkSelect
                            value={shellContainer}
                            onChange={(v) => setShellContainer(v)}
                            aria-label={t("shellContainer")}
                            options={shellContainers.map((c) => ({
                              value: c,
                              label: c,
                            }))}
                          />
                        </div>
                      ) : null}
                      {shellMode === "node" ||
                      shellContainers.length > 1 ||
                      shellPrepError ? (
                        <div className="k8s-detail-tab-actions">
                          <button
                            type="button"
                            className="find-panel-run primary"
                            data-testid="k8s-ssh-shell-start"
                            onClick={() =>
                              void (shellMode === "node"
                                ? runSshNodeShell({
                                    kind: selectedResource!.kind,
                                    namespace: selectedResource!.namespace,
                                    name: selectedResource!.name,
                                  })
                                : runSshPodShell({
                                    kind: selectedResource!.kind,
                                    namespace: selectedResource!.namespace,
                                    name: selectedResource!.name,
                                  }))
                            }
                          >
                            {shellMode === "node"
                              ? t("nodeShell")
                              : t("podShell")}
                          </button>
                        </div>
                      ) : (
                        <p data-testid="k8s-ssh-shell-auto">{t("loading")}</p>
                      )}
                    </>
                  )}
                </div>
              ) : null}
                  </>
                ) : null}
              </div>

              {!selectedResource && !hasSessionTabs ? (
                <p className="k8s-detail-empty">{t("selectResourceHint")}</p>
              ) : null}
            </>
        </aside>
        </>
        ) : undefined
      }
    />

      {confirm && (confirm.kind === "apply" || confirm.kind === "delete") ? (
        <Modal
          title={
            confirm.kind === "apply" ? t("confirmApply") : t("confirmDelete")
          }
          onClose={() => setConfirm(null)}
        >
          {(() => {
            const deleteOwner =
              confirm.kind === "delete"
                ? (confirm.owner ??
                  ownedPodDeleteController(
                    confirm.row.kind,
                    ownerRefsForRow(confirm.row, detail),
                  ))
                : null;
            return (
              <>
          <p className="modal-hint">
            {confirm.kind === "apply"
              ? t("confirmApplyBody")
              : t("confirmDeleteBody", {
                  name: confirm.row.namespace
                    ? `${confirm.row.namespace}/${confirm.row.name}`
                    : confirm.row.name,
                  kind: confirm.row.kind,
                })}
          </p>
          {deleteOwner ? (
            <p className="modal-hint k8s-delete-owned-warn" data-testid="k8s-delete-owned-warn">
              {t("confirmDeleteOwnedPodWarn", {
                owner: `${deleteOwner.kind}/${deleteOwner.name}`,
              })}
            </p>
          ) : null}
          <div className="form-row">
            {confirm.kind === "delete" && deleteOwner ? (
              <>
                <button
                  type="button"
                  className="find-panel-run primary"
                  data-testid="k8s-confirm-delete-owner"
                  onClick={() => {
                    const c = confirm;
                    const ownerRow = controllerOwnerRow(
                      deleteOwner,
                      c.row.namespace,
                    );
                    setConfirm(null);
                    void runDelete(ownerRow).then((ok) => {
                      if (!ok) return;
                      setDetailTab("overview");
                      closeResourceTab(c.row);
                      closeResourceTab(ownerRow);
                    });
                  }}
                >
                  {t("deleteOwner", {
                    kind: deleteOwner.kind,
                    name: deleteOwner.name,
                  })}
                </button>
                <button
                  type="button"
                  data-testid="k8s-confirm-delete-pod-anyway"
                  onClick={() => {
                    const c = confirm;
                    setConfirm(null);
                    void runDelete(c.row).then((ok) => {
                      if (!ok) return;
                      setDetailTab("overview");
                      closeResourceTab(c.row);
                    });
                  }}
                >
                  {t("deletePodAnyway")}
                </button>
                <button
                  type="button"
                  data-testid="k8s-delete-open-owner"
                  onClick={() => {
                    const ownerRow = controllerOwnerRow(
                      deleteOwner,
                      confirm.row.namespace,
                    );
                    setConfirm(null);
                    void navigateToResource(ownerRow).catch((err) =>
                      pushToast(formatAppError(err), false),
                    );
                  }}
                >
                  {t("deleteOpenOwner", { kind: deleteOwner.kind })}
                </button>
                {canScale(deleteOwner.kind) ? (
                  <button
                    type="button"
                    data-testid="k8s-delete-scale-owner-zero"
                    onClick={() => {
                      const ns = confirm.row.namespace;
                      setConfirm(null);
                      void k8sScaleResource(
                        cluster,
                        deleteOwner.kind.toLowerCase(),
                        ns,
                        deleteOwner.name,
                        0,
                      )
                        .then((res) => {
                          pushToast(
                            res.ok
                              ? t("scaleOk")
                              : res.error || t("scaleFailed"),
                            res.ok,
                          );
                          if (res.ok) void refreshResources();
                        })
                        .catch((err) =>
                          pushToast(formatAppError(err), false),
                        );
                    }}
                  >
                    {t("deleteScaleOwnerZero", { kind: deleteOwner.kind })}
                  </button>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                className="find-panel-run primary"
                data-testid={
                  confirm.kind === "delete" ? "k8s-confirm-delete" : undefined
                }
                onClick={() => {
                  const c = confirm;
                  setConfirm(null);
                  if (c.kind === "apply") void runApply();
                  else {
                    void runDelete(c.row).then((ok) => {
                      if (!ok) return;
                      setDetailTab("overview");
                      closeResourceTab(c.row);
                    });
                  }
                }}
              >
                {confirm.kind === "delete"
                  ? t("delete")
                  : t("common:confirm")}
              </button>
            )}
            <button type="button" onClick={() => setConfirm(null)}>
              {t("common:cancel")}
            </button>
          </div>
              </>
            );
          })()}
        </Modal>
      ) : null}

      {confirm && confirm.kind === "scale" ? (
        <Modal title={t("confirmScale")} onClose={() => setConfirm(null)}>
          <div className="k8s-detail-action-pane">
            <label>
              {t("scaleReplicas")}
              <input
                type="number"
                min={0}
                value={scaleReplicas}
                onChange={(e) => setScaleReplicas(e.target.value)}
              />
            </label>
          </div>
          <div className="form-row">
            <button
              type="button"
              className="find-panel-run primary"
              onClick={() => {
                setConfirm(null);
                void runScale();
              }}
            >
              {t("scale")}
            </button>
            <button type="button" onClick={() => setConfirm(null)}>
              {t("common:cancel")}
            </button>
          </div>
        </Modal>
      ) : null}

      {confirm && (confirm.kind === "cordon" || confirm.kind === "uncordon" || confirm.kind === "drain") ? (
        <Modal
          title={
            confirm.kind === "cordon"
              ? t("confirmCordon")
              : confirm.kind === "uncordon"
                ? t("confirmUncordon")
                : t("confirmDrain")
          }
          onClose={() => setConfirm(null)}
        >
          <p className="modal-hint">
            {confirm.kind === "cordon"
              ? t("confirmCordonBody", { name: confirm.row.name })
              : confirm.kind === "uncordon"
                ? t("confirmUncordonBody", { name: confirm.row.name })
                : t("confirmDrainBody", { name: confirm.row.name })}
          </p>
          <div className="form-row">
            <button
              type="button"
              className="find-panel-run primary"
              onClick={() => {
                const c = confirm;
                setConfirm(null);
                if (c.kind === "cordon") void runCordon(c.row);
                else if (c.kind === "uncordon") void runUncordon(c.row);
                else void runDrain(c.row);
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

      {confirm && confirm.kind === "restart" ? (
        <Modal title={t("confirmRestart")} onClose={() => setConfirm(null)}>
          <p className="modal-hint">
            {t("confirmRestartBody", {
              kind: confirm.row.kind,
              name: confirm.row.namespace
                ? `${confirm.row.namespace}/${confirm.row.name}`
                : confirm.row.name,
            })}
          </p>
          <div className="form-row">
            <button
              type="button"
              className="find-panel-run primary"
              onClick={() => {
                const row = confirm.row;
                setConfirm(null);
                void k8sRolloutRestart(cluster, row.kind, row.namespace, row.name)
                  .then((res) => {
                    if (res.ok) {
                      pushToast(t("restartOk"), true);
                      void refreshResources();
                    } else {
                      pushToast(res.error || res.stderr || t("restartFailed"), false);
                    }
                  })
                  .catch((err) => pushToast(formatAppError(err), false));
              }}
            >
              {t("restart")}
            </button>
            <button type="button" onClick={() => setConfirm(null)}>
              {t("common:cancel")}
            </button>
          </div>
        </Modal>
      ) : null}

      {confirm && confirm.kind === "helmRepoAdd" ? (
        <Modal title={t("helmAddRepo")} onClose={() => setConfirm(null)}>
          <div className="k8s-detail-action-pane">
            <label>
              {t("helmRepoName")}
              <input
                value={helmRepoName}
                onChange={(e) => setHelmRepoName(e.target.value)}
              />
            </label>
            <label>
              {t("helmRepoUrl")}
              <input
                value={helmRepoUrl}
                onChange={(e) => setHelmRepoUrl(e.target.value)}
                placeholder="https://charts.bitnami.com/bitnami"
              />
            </label>
          </div>
          <div className="form-row">
            <button
              type="button"
              className="find-panel-run primary"
              onClick={() => {
                const name = helmRepoName.trim();
                const url = helmRepoUrl.trim();
                if (!name || !url) {
                  pushToast(t("helmRepoInvalid"), false);
                  return;
                }
                setConfirm(null);
                void k8sHelmAddRepo(cluster, name, url)
                  .then((res) => {
                    if (res.ok) {
                      pushToast(t("helmRepoAddOk"), true);
                      void refreshResources();
                    } else {
                      pushToast(res.error || res.stderr || t("helmRepoAddFailed"), false);
                    }
                  })
                  .catch((err) => pushToast(formatAppError(err), false));
              }}
            >
              {t("helmAddRepo")}
            </button>
            <button type="button" onClick={() => setConfirm(null)}>
              {t("common:cancel")}
            </button>
          </div>
        </Modal>
      ) : null}

      {confirm && confirm.kind === "helmInstall" ? (
        <Modal title={t("helmInstall")} onClose={() => setConfirm(null)}>
          <div className="k8s-detail-action-pane">
            <p className="modal-hint">{confirm.chart}</p>
            <label>
              {t("helmReleaseName")}
              <input
                value={helmReleaseName}
                onChange={(e) => setHelmReleaseName(e.target.value)}
              />
            </label>
            <label>
              {t("namespace")}
              <input
                value={helmNamespace}
                onChange={(e) => setHelmNamespace(e.target.value)}
              />
            </label>
            <label>
              {t("helmValues")}
              <textarea
                className="k8s-yaml-editor"
                value={helmValues}
                onChange={(e) => setHelmValues(e.target.value)}
                rows={12}
                spellCheck={false}
              />
            </label>
          </div>
          <div className="form-row">
            <button
              type="button"
              className="find-panel-run primary"
              onClick={() => {
                const release = helmReleaseName.trim();
                const ns = helmNamespace.trim() || "default";
                if (!release) {
                  pushToast(t("helmReleaseNameRequired"), false);
                  return;
                }
                const chart = confirm.chart;
                setConfirm(null);
                void k8sHelmInstall(cluster, release, chart, ns, helmValues)
                  .then((res) => {
                    if (res.ok) {
                      pushToast(t("helmInstallOk"), true);
                      setCategory("helm_releases");
                    } else {
                      pushToast(res.error || res.stderr || t("helmInstallFailed"), false);
                    }
                  })
                  .catch((err) => pushToast(formatAppError(err), false));
              }}
            >
              {t("helmInstall")}
            </button>
            <button type="button" onClick={() => setConfirm(null)}>
              {t("common:cancel")}
            </button>
          </div>
        </Modal>
      ) : null}

      {confirm && confirm.kind === "helmUpgrade" ? (
        <Modal title={t("helmUpgrade")} onClose={() => setConfirm(null)}>
          <div className="k8s-detail-action-pane">
            <p className="modal-hint">
              {confirm.row.namespace}/{confirm.row.name}
            </p>
            <label>
              {t("helmValues")}
              <textarea
                className="k8s-yaml-editor"
                value={helmValues}
                onChange={(e) => setHelmValues(e.target.value)}
                rows={12}
                spellCheck={false}
              />
            </label>
          </div>
          <div className="form-row">
            <button
              type="button"
              className="find-panel-run primary"
              onClick={() => {
                const row = confirm.row;
                const chart = row.extra?.trim() || row.name;
                setConfirm(null);
                void k8sHelmUpgrade(
                  cluster,
                  row.name,
                  chart,
                  row.namespace,
                  helmValues,
                )
                  .then((res) => {
                    if (res.ok) {
                      pushToast(t("helmUpgradeOk"), true);
                      void refreshResources();
                    } else {
                      pushToast(res.error || res.stderr || t("helmUpgradeFailed"), false);
                    }
                  })
                  .catch((err) => pushToast(formatAppError(err), false));
              }}
            >
              {t("helmUpgrade")}
            </button>
            <button type="button" onClick={() => setConfirm(null)}>
              {t("common:cancel")}
            </button>
          </div>
        </Modal>
      ) : null}

      {confirm && (confirm.kind === "helmRollback" || confirm.kind === "helmUninstall") ? (
        <Modal
          title={
            confirm.kind === "helmRollback" ? t("helmRollback") : t("helmUninstall")
          }
          onClose={() => setConfirm(null)}
        >
          <p className="modal-hint">
            {confirm.kind === "helmRollback"
              ? t("confirmHelmRollbackBody", {
                  name: `${confirm.row.namespace}/${confirm.row.name}`,
                })
              : t("confirmHelmUninstallBody", {
                  name: `${confirm.row.namespace}/${confirm.row.name}`,
                })}
          </p>
          <div className="form-row">
            <button
              type="button"
              className="find-panel-run primary"
              onClick={() => {
                const row = confirm.row;
                const kind = confirm.kind;
                setConfirm(null);
                const op =
                  kind === "helmRollback"
                    ? k8sHelmRollback(cluster, row.name, row.namespace)
                    : k8sHelmUninstall(cluster, row.name, row.namespace);
                void op
                  .then((res) => {
                    if (res.ok) {
                      pushToast(
                        kind === "helmRollback"
                          ? t("helmRollbackOk")
                          : t("helmUninstallOk"),
                        true,
                      );
                      void refreshResources();
                      if (kind === "helmUninstall") closeResourceTab(row);
                    } else {
                      pushToast(
                        res.error ||
                          res.stderr ||
                          (kind === "helmRollback"
                            ? t("helmRollbackFailed")
                            : t("helmUninstallFailed")),
                        false,
                      );
                    }
                  })
                  .catch((err) => pushToast(formatAppError(err), false));
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

      {jumpHostGate?.status === "confirm" ? (
        <Modal
          title={t("jumpHostConfirmTitle")}
          onClose={() => cancelJumpHostGate()}
        >
          <p className="modal-hint" data-testid="k8s-jump-host-confirm-body">
            {t("jumpHostConfirmBody", {
              cluster: cluster?.display_name ?? jumpHostGate.hostLabel,
              host: jumpHostGate.hostLabel,
            })}
          </p>
          <div className="form-row">
            <button
              type="button"
              className="find-panel-run primary"
              data-testid="k8s-jump-host-confirm"
              disabled={jumpHostBusy}
              onClick={() => {
                setJumpHostBusy(true);
                void ensureJumpHostConnected().finally(() =>
                  setJumpHostBusy(false),
                );
              }}
            >
              {t("jumpHostConfirmConnect")}
            </button>
            <button
              type="button"
              data-testid="k8s-jump-host-cancel"
              disabled={jumpHostBusy}
              onClick={() => cancelJumpHostGate()}
            >
              {t("common:cancel")}
            </button>
          </div>
        </Modal>
      ) : null}

      {jumpHostPasswordOpen && jumpHostGate ? (
        <Modal
          title={t("jumpHostPasswordTitle", { host: jumpHostGate.hostLabel })}
          onClose={() => {
            setJumpHostPasswordOpen(false);
            setJumpHostPassword("");
          }}
        >
          <form
            className="connection-form"
            onSubmit={(event) => {
              event.preventDefault();
              setJumpHostBusy(true);
              void ensureJumpHostConnected({
                password: jumpHostPassword || null,
                rememberPassword: jumpHostRemember,
              })
                .then((ok) => {
                  if (ok) {
                    setJumpHostPasswordOpen(false);
                    setJumpHostPassword("");
                  }
                })
                .finally(() => setJumpHostBusy(false));
            }}
          >
            <label>
              {t("connection:fieldPassword")}
              <input
                type="password"
                value={jumpHostPassword}
                onChange={(e) => setJumpHostPassword(e.target.value)}
                autoFocus
                data-testid="k8s-jump-host-password"
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={jumpHostRemember}
                onChange={(e) => setJumpHostRemember(e.target.checked)}
              />
              {t("connection:rememberPassword")}
            </label>
            <div className="form-row">
              <button type="submit" disabled={jumpHostBusy}>
                {t("jumpHostPasswordSubmit")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setJumpHostPasswordOpen(false);
                  setJumpHostPassword("");
                }}
              >
                {t("common:cancel")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

    </>
  );
}

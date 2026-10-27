import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import i18n from "../i18n";
import { formatAppError } from "../lib/formatAppError";
import type { ProcessEntry, ProcessListResult, SessionKind } from "../types";
import type { ProcessSortKey, SortDirection } from "../components/TaskManagerTable";
import { useFindStore } from "./findStore";
import { useHostStatsStore } from "./hostStatsStore";
import { useSessionStore } from "./sessionStore";
import { useToastStore } from "./toastStore";
import { desktopTargetKey, type DesktopTarget } from "../lib/desktopTarget";
import {
  readWorkspacePanelWidth,
  setWorkspacePanelWidth,
  subscribeWorkspacePanelWidth,
} from "../lib/workspacePanelWidth";

const TASK_MANAGER_SORT_KEY = "terminal-wisely.task-manager-sort-key";
const TASK_MANAGER_SORT_DIR_KEY = "terminal-wisely.task-manager-sort-dir";
const KILLED_TOMBSTONE_MS = 20_000;

type ProcessListMode = "full" | "basic" | "ports";
type ProcessRefreshMode = "basic" | "ports" | "full";

const processFetchSeq = new Map<string, number>();
let portsFetchInflight = 0;
const processCache = new Map<string, ProcessEntry[]>();
const killedProcessTombstones = new Map<string, Map<number, number>>();

function readSortKey(): ProcessSortKey {
  const value = localStorage.getItem(TASK_MANAGER_SORT_KEY);
  if (value === "name" || value === "cpu" || value === "memory" || value === "port") {
    return value;
  }
  return "cpu";
}

function readSortDirection(): SortDirection {
  return localStorage.getItem(TASK_MANAGER_SORT_DIR_KEY) === "asc" ? "asc" : "desc";
}

function tombstonesFor(sessionId: string) {
  let map = killedProcessTombstones.get(sessionId);
  if (!map) {
    map = new Map();
    killedProcessTombstones.set(sessionId, map);
  }
  return map;
}

function markKilled(sessionId: string, pid: number) {
  tombstonesFor(sessionId).set(pid, Date.now());
}

function unmarkKilled(sessionId: string, pid: number) {
  tombstonesFor(sessionId).delete(pid);
}

function applyTombstones(sessionId: string, processes: ProcessEntry[]): ProcessEntry[] {
  const map = killedProcessTombstones.get(sessionId);
  if (!map || map.size === 0) {
    return processes;
  }

  const now = Date.now();
  const incomingPids = new Set(processes.map((process) => process.pid));
  for (const [pid, killedAt] of map) {
    if (now - killedAt > KILLED_TOMBSTONE_MS || !incomingPids.has(pid)) {
      map.delete(pid);
    }
  }
  if (map.size === 0) {
    killedProcessTombstones.delete(sessionId);
  }

  return processes.filter((process) => !map.has(process.pid));
}

function cacheProcesses(sessionId: string, processes: ProcessEntry[]) {
  if (processes.length > 0) {
    processCache.set(sessionId, processes);
  }
}

function publishProcesses(sessionId: string, processes: ProcessEntry[]) {
  return applyTombstones(sessionId, processes);
}

function mergeProcessPorts(
  base: ProcessEntry[],
  portEntries: ProcessEntry[],
): ProcessEntry[] {
  if (portEntries.length === 0) {
    return base;
  }

  const portMap = new Map(portEntries.map((entry) => [entry.pid, entry.ports]));
  return base.map((process) => {
    const ports = portMap.get(process.pid);
    if (ports === undefined) {
      return process;
    }
    return { ...process, ports: [...ports].sort((a, b) => a - b) };
  });
}

function refreshProcessMetrics(
  sessionId: string,
  previous: ProcessEntry[],
  incoming: ProcessEntry[],
): ProcessEntry[] {
  const portMap = new Map(previous.map((entry) => [entry.pid, entry.ports]));
  return publishProcesses(
    sessionId,
    incoming.map((process) => ({
      ...process,
      ports: portMap.get(process.pid) ?? process.ports,
    })),
  );
}

type ProcessTarget = string | DesktopTarget;

function processBucketKey(target: ProcessTarget): string {
  if (typeof target === "string") return `ssh:${target}`;
  return desktopTargetKey(target);
}

function processSessionId(target: ProcessTarget): string | null {
  if (typeof target === "string") return target;
  return target.kind === "ssh" ? target.sessionId : null;
}

async function listProcesses(target: ProcessTarget, mode: ProcessListMode) {
  if (typeof target !== "string" && target.kind === "local") {
    return invoke<ProcessListResult>("list_local_processes");
  }
  const sessionId = processSessionId(target);
  if (!sessionId) throw new Error("SSH session is required");
  return invoke<ProcessListResult>("list_processes", {
    request: { session_id: sessionId, mode },
  });
}

function friendlyProcessError(err: unknown): string {
  const message = String(err);
  if (
    /channel send error|SSH 连接已断开|ERR_SSH_DISCONNECTED|connection reset|broken pipe|Session not found/i.test(
      message,
    )
  ) {
    return i18n.t("tools:taskManager.disconnectedError");
  }
  return formatAppError(err);
}

interface TaskManagerState {
  targetKey: string | null;
  open: boolean;
  width: number;
  processes: ProcessEntry[];
  loading: boolean;
  syncing: boolean;
  portsLoading: boolean;
  error: string | null;
  lastUpdated: number | null;
  filterQuery: string;
  sortKey: ProcessSortKey;
  sortDirection: SortDirection;
  setWidth: (width: number) => void;
  setFilterQuery: (query: string) => void;
  setSort: (key: ProcessSortKey) => void;
  toggleOpen: () => void;
  close: () => void;
  fetchProcesses: (
    target: ProcessTarget,
    options?: {
      initial?: boolean;
      kind?: SessionKind;
      refresh?: ProcessRefreshMode;
    },
  ) => Promise<void>;
  killProcess: (target: ProcessTarget, pid: number, name: string, force?: boolean) => Promise<void>;
}

export const useTaskManagerStore = create<TaskManagerState>((set, get) => ({
  targetKey: null,
  open: false,
  width: readWorkspacePanelWidth(),
  processes: [],
  loading: false,
  syncing: false,
  portsLoading: false,
  error: null,
  lastUpdated: null,
  filterQuery: "",
  sortKey: readSortKey(),
  sortDirection: readSortDirection(),

  setWidth: (width) => {
    const next = setWorkspacePanelWidth(width);
    set({ width: next });
  },

  setFilterQuery: (query) => set({ filterQuery: query }),

  setSort: (key) => {
    const { sortKey, sortDirection } = get();
    if (sortKey === key) {
      const next = sortDirection === "asc" ? "desc" : "asc";
      localStorage.setItem(TASK_MANAGER_SORT_DIR_KEY, next);
      set({ sortDirection: next });
      return;
    }
    const next = key === "name" ? "asc" : "desc";
    localStorage.setItem(TASK_MANAGER_SORT_KEY, key);
    localStorage.setItem(TASK_MANAGER_SORT_DIR_KEY, next);
    set({ sortKey: key, sortDirection: next });
  },

  toggleOpen: () => {
    set((state) => {
      const next = !state.open;
      if (next) {
        useFindStore.getState().close();
        useHostStatsStore.getState().close();
      }
      return { open: next };
    });
  },

  close: () =>
    set({
      open: false,
      targetKey: null,
      filterQuery: "",
      error: null,
      portsLoading: false,
      syncing: false,
    }),

  fetchProcesses: async (target, options) => {
    const bucketKey = processBucketKey(target);
    const sessionId = processSessionId(target);
    const isLocal = sessionId === null;
    const isFirstPaint = options?.initial === true;
    const refreshMode = options?.refresh;
    const isBackgroundRefresh = refreshMode != null;

    if (sessionId && useSessionStore.getState().disconnectedSessionIds.has(sessionId)) {
      if (isFirstPaint) {
        set({
          loading: false,
          syncing: false,
          portsLoading: false,
          error: i18n.t("tools:taskManager.disconnectedError"),
        });
      }
      return;
    }

    if (refreshMode === "basic" && get().loading) {
      return;
    }
    if (refreshMode === "ports" && (get().loading || portsFetchInflight > 0)) {
      return;
    }

    if (isFirstPaint) {
      processFetchSeq.set(bucketKey, (processFetchSeq.get(bucketKey) ?? 0) + 1);
      const cached = processCache.get(bucketKey);
      if (cached?.length) {
        set({
          targetKey: bucketKey,
          processes: publishProcesses(bucketKey, cached),
          loading: false,
          syncing: true,
          error: null,
          portsLoading: false,
        });
      } else {
        set({ targetKey: bucketKey, loading: true, syncing: false, error: null, portsLoading: false, processes: [] });
      }
    } else if (isBackgroundRefresh) {
      set({ syncing: true });
    }

    const seq = processFetchSeq.get(bucketKey) ?? 0;
    const isStale = () => seq !== (processFetchSeq.get(bucketKey) ?? 0);

    const finishSync = (patch: Partial<TaskManagerState> = {}) => {
      set({ syncing: false, ...patch });
    };

    const fail = (err: unknown, keepExisting = false) => {
      if (isStale()) return;
      const message = friendlyProcessError(err);
      if (keepExisting && get().processes.length > 0) {
        finishSync({ loading: false, portsLoading: false });
        return;
      }
      finishSync({ loading: false, portsLoading: false, error: message });
    };

    try {
      if (isFirstPaint) {
        const finishBasic = async (basic: ProcessListResult) => {
          if (isStale()) return;
          const processes = publishProcesses(bucketKey, basic.processes);
          cacheProcesses(bucketKey, processes);
          set({
            targetKey: bucketKey,
            processes,
            loading: false,
            syncing: true,
            error: null,
            lastUpdated: Date.now(),
            portsLoading: true,
          });

          if (isLocal) {
            finishSync({ portsLoading: false, processes, lastUpdated: Date.now() });
            return;
          }

          try {
            const ports = await listProcesses(target, "ports");
            if (isStale()) return;
            const merged = publishProcesses(
              bucketKey,
              mergeProcessPorts(processes, ports.processes),
            );
            cacheProcesses(bucketKey, merged);
            finishSync({
              processes: merged,
              portsLoading: false,
              lastUpdated: Date.now(),
            });
          } catch {
            if (!isStale()) {
              finishSync({ portsLoading: false });
            }
          }
        };

        void listProcesses(target, "basic")
          .then((basic) => void finishBasic(basic))
          .catch((err) => fail(err));
        return;
      }

      if (refreshMode === "basic") {
        try {
          const result = await listProcesses(target, "basic");
          if (isStale()) return;
          const processes = refreshProcessMetrics(bucketKey, get().processes, result.processes);
          cacheProcesses(bucketKey, processes);
          finishSync({
            processes,
            error: null,
            lastUpdated: Date.now(),
          });
        } catch (err) {
          fail(err, true);
        }
        return;
      }

      if (refreshMode === "ports") {
        portsFetchInflight += 1;
        set({ portsLoading: true });
        try {
          const ports = await listProcesses(target, "ports");
          if (isStale()) return;
          const processes = publishProcesses(
            bucketKey,
            mergeProcessPorts(get().processes, ports.processes),
          );
          cacheProcesses(bucketKey, processes);
          finishSync({
            processes,
            portsLoading: false,
            error: null,
            lastUpdated: Date.now(),
          });
        } catch (err) {
          fail(err, true);
        } finally {
          portsFetchInflight = Math.max(0, portsFetchInflight - 1);
          if (portsFetchInflight === 0 && !isStale()) {
            set({ portsLoading: false });
          }
        }
        return;
      }

      if (refreshMode === "full") {
        if (!get().loading) {
          set({ portsLoading: true });
        }
          const result = await listProcesses(target, "full");
        if (isStale()) return;

        const processes = publishProcesses(bucketKey, result.processes);
        cacheProcesses(bucketKey, processes);
        finishSync({
          processes,
          loading: false,
          portsLoading: false,
          error: null,
          lastUpdated: Date.now(),
        });
        return;
      }
    } catch (err) {
      fail(err, !isFirstPaint);
    }
  },

  killProcess: async (target, pid, name, force = false) => {
    const bucketKey = processBucketKey(target);
    const sessionId = processSessionId(target);
    markKilled(bucketKey, pid);
    set((state) => ({
      processes: state.processes.filter((process) => process.pid !== pid),
    }));

    try {
      if (sessionId) {
        await invoke("kill_process", {
          request: { session_id: sessionId, pid, force },
        });
      } else {
        await invoke("kill_local_process", { pid, force });
      }
      useToastStore
        .getState()
        .pushToast(i18n.t("tools:taskManager.killedToast", { name, pid }), true);
    } catch (err) {
      unmarkKilled(bucketKey, pid);
      void get().fetchProcesses(target, { refresh: "full" });
      useToastStore.getState().pushToast(formatAppError(err), false);
    }
  },
}));

subscribeWorkspacePanelWidth((width) => {
  if (useTaskManagerStore.getState().width !== width) {
    useTaskManagerStore.setState({ width });
  }
});

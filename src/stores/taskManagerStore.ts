import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { ProcessEntry, ProcessListResult } from "../types";
import type { ProcessSortKey, SortDirection } from "../components/TaskManagerTable";
import { useToastStore } from "./toastStore";

const TASK_MANAGER_WIDTH_KEY = "terminal-wisely.task-manager-width";
const TASK_MANAGER_SORT_KEY = "terminal-wisely.task-manager-sort-key";
const TASK_MANAGER_SORT_DIR_KEY = "terminal-wisely.task-manager-sort-dir";
const DEFAULT_TASK_MANAGER_WIDTH = 380;

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

interface TaskManagerState {
  open: boolean;
  width: number;
  processes: ProcessEntry[];
  loading: boolean;
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
  fetchProcesses: (sessionId: string, options?: { initial?: boolean }) => Promise<void>;
  killProcess: (sessionId: string, pid: number, name: string, force?: boolean) => Promise<void>;
}

export const useTaskManagerStore = create<TaskManagerState>((set, get) => ({
  open: false,
  width: Number(localStorage.getItem(TASK_MANAGER_WIDTH_KEY)) || DEFAULT_TASK_MANAGER_WIDTH,
  processes: [],
  loading: false,
  error: null,
  lastUpdated: null,
  filterQuery: "",
  sortKey: readSortKey(),
  sortDirection: readSortDirection(),

  setWidth: (width) => {
    const next = Math.max(320, Math.min(width, 720));
    localStorage.setItem(TASK_MANAGER_WIDTH_KEY, String(next));
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

  toggleOpen: () => set((state) => ({ open: !state.open })),

  close: () =>
    set({
      open: false,
      filterQuery: "",
      error: null,
    }),

  fetchProcesses: async (sessionId, options) => {
    const initial = options?.initial ?? get().processes.length === 0;
    if (initial) {
      set({ loading: true, error: null });
    }

    try {
      const result = await invoke<ProcessListResult>("list_processes", {
        request: { session_id: sessionId },
      });
      set({
        processes: result.processes,
        loading: false,
        error: null,
        lastUpdated: Date.now(),
      });
    } catch (err) {
      const message = String(err);
      set({ loading: false, error: message });
    }
  },

  killProcess: async (sessionId, pid, name, force = false) => {
    try {
      await invoke("kill_process", {
        request: { session_id: sessionId, pid, force },
      });
      useToastStore.getState().pushToast(`已结束进程 ${name} (${pid})`, true);
      await get().fetchProcesses(sessionId);
    } catch (err) {
      useToastStore.getState().pushToast(String(err), false);
    }
  },
}));

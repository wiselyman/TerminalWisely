import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { FindFileEntry, FindFilesResult, FindTypeFilter } from "../types";
import { useHostStatsStore } from "./hostStatsStore";
import { useTaskManagerStore } from "./taskManagerStore";

const FIND_WIDTH_KEY = "terminal-wisely.find-width";
const FIND_OPTIONS_KEY = "terminal-wisely.find-options";
const DEFAULT_FIND_WIDTH = 420;

interface PersistedFindOptions {
  namePattern?: string;
  typeFilter?: FindTypeFilter;
  maxDepth?: number;
  caseInsensitive?: boolean;
}

function loadFindOptions(): PersistedFindOptions {
  try {
    const raw = localStorage.getItem(FIND_OPTIONS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PersistedFindOptions;
  } catch {
    return {};
  }
}

function persistFindOptions(options: PersistedFindOptions) {
  localStorage.setItem(FIND_OPTIONS_KEY, JSON.stringify(options));
}

const savedOptions = loadFindOptions();

interface FindState {
  open: boolean;
  width: number;
  sessionCwd: string | null;
  namePattern: string;
  typeFilter: FindTypeFilter;
  maxDepth: number;
  caseInsensitive: boolean;
  entries: FindFileEntry[];
  truncated: boolean;
  loading: boolean;
  error: string | null;
  lastRunAt: number | null;
  activeSessionId: string | null;
  focusNonce: number;
  setWidth: (width: number) => void;
  setNamePattern: (pattern: string) => void;
  setTypeFilter: (filter: FindTypeFilter) => void;
  setMaxDepth: (depth: number) => void;
  setCaseInsensitive: (value: boolean) => void;
  openFind: (sessionId: string) => void;
  toggleOpen: (sessionId: string) => void;
  close: () => void;
  loadSessionCwd: (sessionId: string) => Promise<void>;
  runFind: (sessionId: string) => Promise<void>;
  resetResults: () => void;
}

function snapshotOptions(state: FindState): PersistedFindOptions {
  return {
    namePattern: state.namePattern,
    typeFilter: state.typeFilter,
    maxDepth: state.maxDepth,
    caseInsensitive: state.caseInsensitive,
  };
}

export const useFindStore = create<FindState>((set, get) => ({
  open: false,
  width: Number(localStorage.getItem(FIND_WIDTH_KEY)) || DEFAULT_FIND_WIDTH,
  sessionCwd: null,
  namePattern: savedOptions.namePattern ?? "",
  typeFilter: savedOptions.typeFilter ?? "all",
  maxDepth: savedOptions.maxDepth ?? 8,
  caseInsensitive: savedOptions.caseInsensitive ?? false,
  entries: [],
  truncated: false,
  loading: false,
  error: null,
  lastRunAt: null,
  activeSessionId: null,
  focusNonce: 0,

  setWidth: (width) => {
    const next = Math.max(320, Math.min(width, 720));
    localStorage.setItem(FIND_WIDTH_KEY, String(next));
    set({ width: next });
  },

  setNamePattern: (namePattern) => {
    persistFindOptions({ ...snapshotOptions(get()), namePattern });
    set({ namePattern });
  },

  setTypeFilter: (typeFilter) => {
    persistFindOptions({ ...snapshotOptions(get()), typeFilter });
    set({ typeFilter });
  },

  setMaxDepth: (maxDepth) => {
    const next = Math.max(1, Math.min(maxDepth, 32));
    persistFindOptions({ ...snapshotOptions(get()), maxDepth: next });
    set({ maxDepth: next });
  },

  setCaseInsensitive: (caseInsensitive) => {
    persistFindOptions({ ...snapshotOptions(get()), caseInsensitive });
    set({ caseInsensitive });
  },

  resetResults: () =>
    set({
      entries: [],
      truncated: false,
      error: null,
      lastRunAt: null,
    }),

  openFind: (sessionId) => {
    useTaskManagerStore.getState().close();
    useHostStatsStore.getState().close();
    set((state) => ({
      open: true,
      activeSessionId: sessionId,
      focusNonce: state.focusNonce + 1,
    }));
    void get().loadSessionCwd(sessionId);
  },

  toggleOpen: (sessionId) => {
    const { open } = get();
    if (open) {
      get().close();
      return;
    }
    get().openFind(sessionId);
  },

  close: () =>
    set({
      open: false,
      loading: false,
      error: null,
    }),

  loadSessionCwd: async (sessionId) => {
    try {
      const cwd = await invoke<string>("get_session_cwd", {
        request: { session_id: sessionId },
      });
      set({ sessionCwd: cwd || null });
    } catch {
      set({ sessionCwd: null });
    }
  },

  runFind: async (sessionId) => {
    const state = get();
    const namePattern = state.namePattern.trim();
    if (!namePattern) {
      set({ error: "请输入文件名模式", activeSessionId: sessionId });
      return;
    }

    set({ loading: true, error: null, activeSessionId: sessionId });

    try {
      const result = await invoke<FindFilesResult>("find_files", {
        request: {
          session_id: sessionId,
          path: ".",
          name_pattern: namePattern,
          type_filter: state.typeFilter,
          max_depth: state.maxDepth,
          case_insensitive: state.caseInsensitive,
        },
      });
      set({
        entries: result.entries,
        truncated: result.truncated,
        sessionCwd: result.start_path,
        loading: false,
        error: null,
        lastRunAt: Date.now(),
      });
    } catch (err) {
      set({
        loading: false,
        error: String(err),
        entries: [],
        truncated: false,
      });
    }
  },
}));

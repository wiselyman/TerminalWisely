import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { formatAppError } from "../lib/formatAppError";
import {
  normalizeRemotePath,
  parentRemotePath,
  type FsClipboard,
} from "../lib/localFsOps";
import type { ListLocalDirectoryResult, LocalFsEntry } from "../types";
import {
  readWorkspacePanelWidth,
  setWorkspacePanelWidth,
  subscribeWorkspacePanelWidth,
} from "../lib/workspacePanelWidth";

const SHOW_HIDDEN_KEY = "tw.localFs.showHidden";
const VIEW_MODE_KEY = "tw.localFs.viewMode";
const SPLIT_TREE_WIDTH_KEY = "tw.localFs.splitTreeWidth";

export type LocalFsViewMode = "list" | "grid";

function loadShowHidden(): boolean {
  try {
    return localStorage.getItem(SHOW_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function loadViewMode(): LocalFsViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

function loadSplitTreeWidth(): number {
  try {
    const raw = Number(localStorage.getItem(SPLIT_TREE_WIDTH_KEY));
    if (Number.isFinite(raw) && raw >= 140 && raw <= 420) return raw;
  } catch {
    // ignore
  }
  return 200;
}

function toSet(values: string[]): Set<string> {
  return new Set(values);
}

/** Per-session browsing state so tab switches restore the prior directory. */
export interface LocalFsSessionSnapshot {
  rootPath: string | null;
  rootLabel: string;
  childrenCache: Record<string, LocalFsEntry[]>;
  expandedPaths: string[];
  selectedPath: string | null;
  selectedPaths: string[];
  selectionAnchor: string | null;
  contentsPath: string | null;
  contentsHistory: string[];
  clipboard: FsClipboard | null;
}

function captureSessionSnapshot(state: LocalFsState): LocalFsSessionSnapshot {
  return {
    rootPath: state.rootPath,
    rootLabel: state.rootLabel,
    childrenCache: state.childrenCache,
    expandedPaths: state.expandedPaths,
    selectedPath: state.selectedPath,
    selectedPaths: state.selectedPaths,
    selectionAnchor: state.selectionAnchor,
    contentsPath: state.contentsPath,
    contentsHistory: state.contentsHistory,
    clipboard: state.clipboard,
  };
}

const emptySessionBrowseState: LocalFsSessionSnapshot = {
  rootPath: null,
  rootLabel: "~",
  childrenCache: {},
  expandedPaths: [],
  selectedPath: null,
  selectedPaths: [],
  selectionAnchor: null,
  contentsPath: null,
  contentsHistory: [],
  clipboard: null,
};

export interface LocalFsState {
  open: boolean;
  sessionId: string | null;
  width: number;
  activeTab: "files" | "find" | "taskManager";
  rootPath: string | null;
  rootLabel: string;
  childrenCache: Record<string, LocalFsEntry[]>;
  expandedPaths: string[];
  loadingPaths: string[];
  loadingRoot: boolean;
  error: string | null;
  selectedPath: string | null;
  selectedPaths: string[];
  selectionAnchor: string | null;
  /** Directory shown in the right contents pane. */
  contentsPath: string | null;
  /** Previous contentsPath values for Back (most recent at end). */
  contentsHistory: string[];
  viewMode: LocalFsViewMode;
  splitTreeWidth: number;
  clipboard: FsClipboard | null;
  showHidden: boolean;
  sessionSnapshots: Record<string, LocalFsSessionSnapshot>;
  openPanel: (sessionId: string, tab?: "files" | "find" | "taskManager") => void;
  /** Save current browse path and restore the target session's last path. */
  activateSession: (sessionId: string) => void;
  close: () => void;
  setWidth: (w: number) => void;
  setSplitTreeWidth: (w: number) => void;
  setActiveTab: (tab: "files" | "find" | "taskManager") => void;
  setSelectedPath: (path: string | null) => void;
  setSelectedPaths: (paths: string[], anchor?: string | null) => void;
  setViewMode: (mode: LocalFsViewMode) => void;
  setClipboard: (clip: FsClipboard | null) => void;
  setShowHidden: (show: boolean) => void;
  initTree: (path?: string) => Promise<void>;
  /** Select + show folder in the right pane (tree expand only via chevron). */
  openDirectory: (
    path: string,
    opts?: { fromHistory?: boolean },
  ) => Promise<void>;
  goBack: () => Promise<void>;
  goUp: () => Promise<void>;
  toggleDirectory: (path: string) => Promise<void>;
  refreshTree: () => Promise<void>;
  /** Re-fetch one directory into childrenCache (local dynamic load). */
  reloadDirectory: (
    dirPath: string,
    opts?: { ensureExpanded?: boolean },
  ) => Promise<void>;
  invalidateSubtree: (path: string) => void;
  getEntryByPath: (path: string) => LocalFsEntry | null;
  getUploadDirectory: () => string | null;
}

async function fetchDirectory(
  sessionId: string,
  path?: string | null,
  showHidden = false,
): Promise<ListLocalDirectoryResult> {
  return invoke<ListLocalDirectoryResult>("list_remote_directory", {
    request: {
      session_id: sessionId,
      path: path ?? undefined,
      show_hidden: showHidden,
    },
  });
}

export const useLocalFsStore = create<LocalFsState>((set, get) => ({
  open: false,
  sessionId: null,
  width: readWorkspacePanelWidth(),
  activeTab: "files",
  rootPath: null,
  rootLabel: "~",
  childrenCache: {},
  expandedPaths: [],
  loadingPaths: [],
  loadingRoot: false,
  error: null,
  selectedPath: null,
  selectedPaths: [],
  selectionAnchor: null,
  contentsPath: null,
  contentsHistory: [],
  viewMode: loadViewMode(),
  splitTreeWidth: loadSplitTreeWidth(),
  clipboard: null,
  showHidden: loadShowHidden(),
  sessionSnapshots: {},

  openPanel: (sessionId, tab = "files") => {
    const prev = get();
    if (prev.open && prev.sessionId === sessionId) {
      set({ open: true, activeTab: tab, error: null });
      return;
    }
    get().activateSession(sessionId);
    set({ open: true, activeTab: tab, error: null });
  },

  activateSession: (sessionId) => {
    const prev = get();
    if (prev.sessionId === sessionId) return;

    let sessionSnapshots = prev.sessionSnapshots;
    if (prev.sessionId) {
      sessionSnapshots = {
        ...sessionSnapshots,
        [prev.sessionId]: captureSessionSnapshot(prev),
      };
    }

    const restored = sessionSnapshots[sessionId];
    if (restored?.contentsPath || restored?.rootPath) {
      const refreshPath = restored.contentsPath || restored.rootPath;
      const cacheHit = Boolean(
        refreshPath && restored.childrenCache[refreshPath],
      );
      set({
        sessionId,
        sessionSnapshots,
        error: null,
        loadingPaths: [],
        loadingRoot: false,
        ...restored,
      });
      // Warm cache: show immediately, skip SSH (was the main switch lag).
      // Cold restore (path known, listing missing): fetch that dir only.
      if (refreshPath && !cacheHit) {
        void get().reloadDirectory(refreshPath);
      }
      return;
    }

    set({
      sessionId,
      sessionSnapshots,
      error: null,
      loadingPaths: [],
      loadingRoot: true,
      ...emptySessionBrowseState,
    });
    void get().initTree("~");
  },

  close: () => {
    const prev = get();
    if (prev.sessionId) {
      set({
        open: false,
        sessionId: null,
        sessionSnapshots: {
          ...prev.sessionSnapshots,
          [prev.sessionId]: captureSessionSnapshot(prev),
        },
      });
      return;
    }
    set({ open: false, sessionId: null });
  },

  setWidth: (w) => {
    set({ width: w });
    setWorkspacePanelWidth(w);
  },

  setSplitTreeWidth: (w) => {
    const clamped = Math.max(140, Math.min(420, Math.round(w)));
    try {
      localStorage.setItem(SPLIT_TREE_WIDTH_KEY, String(clamped));
    } catch {
      // ignore
    }
    set({ splitTreeWidth: clamped });
  },

  setActiveTab: (activeTab) => set({ activeTab }),

  setSelectedPath: (path) =>
    set({
      selectedPath: path,
      selectedPaths: path ? [path] : [],
      selectionAnchor: path,
    }),

  setSelectedPaths: (paths, anchor) =>
    set({
      selectedPaths: paths,
      selectedPath: paths[paths.length - 1] ?? null,
      selectionAnchor: anchor === undefined ? paths[paths.length - 1] ?? null : anchor,
    }),

  setViewMode: (mode) => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // ignore
    }
    set({ viewMode: mode });
  },

  setClipboard: (clipboard) => set({ clipboard }),

  setShowHidden: (show) => {
    try {
      localStorage.setItem(SHOW_HIDDEN_KEY, show ? "1" : "0");
    } catch {
      // ignore
    }
    set({ showHidden: show });
    void get().refreshTree();
  },

  initTree: async (path = "~") => {
    const sessionId = get().sessionId;
    if (!sessionId) return;

    const label = path === "/" ? "/" : path === "~" ? "~" : path;
    const showHidden = get().showHidden;
    set({
      loadingRoot: true,
      error: null,
      rootLabel: label,
      childrenCache: {},
      expandedPaths: [],
      loadingPaths: [],
      selectedPath: null,
      selectedPaths: [],
      selectionAnchor: null,
      contentsPath: null,
      contentsHistory: [],
    });

    try {
      const result = await fetchDirectory(sessionId, path, showHidden);
      if (get().sessionId !== sessionId) return;
      set({
        rootPath: result.path,
        childrenCache: { [result.path]: result.entries },
        expandedPaths: [result.path],
        contentsPath: result.path,
        selectedPath: result.path,
        selectedPaths: [result.path],
        selectionAnchor: result.path,
        loadingRoot: false,
      });
    } catch (err) {
      if (get().sessionId !== sessionId) return;
      set({
        loadingRoot: false,
        error: formatAppError(err),
      });
    }
  },

  openDirectory: async (path, opts) => {
    const sessionId = get().sessionId;
    const raw = normalizeRemotePath(path || "");
    if (!sessionId || !raw) return;

    const showHidden = get().showHidden;
    const prev = get().contentsPath;
    const prevNorm = prev ? normalizeRemotePath(prev) : null;
    let history = get().contentsHistory;
    if (
      !opts?.fromHistory &&
      prevNorm &&
      prevNorm !== raw &&
      (history.length === 0 || history[history.length - 1] !== prevNorm)
    ) {
      history = [...history, prevNorm];
    }

    set({
      contentsHistory: history,
      contentsPath: raw,
      selectedPath: raw,
      selectedPaths: [raw],
      selectionAnchor: raw,
      error: null,
    });

    if (get().childrenCache[raw]) return;

    const loading = new Set(get().loadingPaths);
    loading.add(raw);
    set({ loadingPaths: [...loading] });

    try {
      const result = await fetchDirectory(sessionId, raw, showHidden);
      if (get().sessionId !== sessionId) return;
      const nextLoading = new Set(get().loadingPaths);
      nextLoading.delete(raw);
      nextLoading.delete(result.path);
      set({
        loadingPaths: [...nextLoading],
        childrenCache: {
          ...get().childrenCache,
          [result.path]: result.entries,
        },
        contentsPath: result.path,
        selectedPath: result.path,
        selectedPaths: [result.path],
        selectionAnchor: result.path,
      });
    } catch (err) {
      if (get().sessionId !== sessionId) return;
      const nextLoading = new Set(get().loadingPaths);
      nextLoading.delete(raw);
      set({
        loadingPaths: [...nextLoading],
        error: formatAppError(err),
      });
    }
  },

  goBack: async () => {
    const stack = get().contentsHistory;
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    set({ contentsHistory: stack.slice(0, -1) });
    await get().openDirectory(next, { fromHistory: true });
  },

  goUp: async () => {
    const current = get().contentsPath;
    if (!current) return;
    const parent = parentRemotePath(current);
    if (normalizeRemotePath(parent) === normalizeRemotePath(current)) return;
    await get().openDirectory(parent);
  },

  toggleDirectory: async (path) => {
    const state = get();
    // Top-level root stays permanently expanded (no chevron / no collapse).
    if (path === state.rootPath) return;

    const expanded = toSet(state.expandedPaths);
    if (expanded.has(path)) {
      expanded.delete(path);
      set({ expandedPaths: [...expanded] });
      return;
    }

    expanded.add(path);
    set({ expandedPaths: [...expanded] });

    if (state.childrenCache[path]) return;

    const sessionId = state.sessionId;
    if (!sessionId) return;

    const loading = new Set(state.loadingPaths);
    loading.add(path);
    set({ loadingPaths: [...loading], error: null });

    try {
      const result = await fetchDirectory(sessionId, path, state.showHidden);
      if (get().sessionId !== sessionId) return;
      const nextLoading = new Set(get().loadingPaths);
      nextLoading.delete(path);
      set({
        loadingPaths: [...nextLoading],
        childrenCache: {
          ...get().childrenCache,
          [result.path]: result.entries,
        },
      });
    } catch (err) {
      if (get().sessionId !== sessionId) return;
      const nextLoading = new Set(get().loadingPaths);
      nextLoading.delete(path);
      const nextExpanded = new Set(get().expandedPaths);
      nextExpanded.delete(path);
      set({
        loadingPaths: [...nextLoading],
        expandedPaths: [...nextExpanded],
        error: formatAppError(err),
      });
    }
  },

  refreshTree: async () => {
    const { sessionId, rootPath, rootLabel, expandedPaths, showHidden, contentsPath } =
      get();
    if (!sessionId || !rootPath) {
      await get().initTree(rootLabel === "/" ? "/" : "~");
      return;
    }

    const initPath = rootLabel === "/" ? "/" : rootPath.startsWith("/") ? rootPath : "~";
    set({ loadingRoot: true, error: null, childrenCache: {}, loadingPaths: [] });

    try {
      const root = await fetchDirectory(sessionId, initPath, showHidden);
      if (get().sessionId !== sessionId) return;
      const cache: Record<string, LocalFsEntry[]> = {
        [root.path]: root.entries,
      };
      const keepExpanded = expandedPaths.filter(
        (p) => p === root.path || p.startsWith(`${root.path}/`),
      );
      // Ensure right-pane contents stay cached without forcing the tree open.
      const pathsToFetch = new Set(keepExpanded);
      if (contentsPath) pathsToFetch.add(contentsPath);

      for (const path of pathsToFetch) {
        if (path === root.path) continue;
        if (get().sessionId !== sessionId) return;
        try {
          const result = await fetchDirectory(sessionId, path, showHidden);
          cache[result.path] = result.entries;
        } catch {
          // Skip paths that fail on refresh (deleted/moved).
        }
      }

      const nextContents =
        contentsPath && cache[contentsPath] ? contentsPath : root.path;

      if (get().sessionId !== sessionId) return;
      set({
        rootPath: root.path,
        childrenCache: cache,
        expandedPaths: keepExpanded.length > 0 ? keepExpanded : [root.path],
        contentsPath: nextContents,
        loadingRoot: false,
      });
    } catch (err) {
      if (get().sessionId !== sessionId) return;
      set({
        loadingRoot: false,
        error: formatAppError(err),
      });
    }
  },

  reloadDirectory: async (dirPath, opts) => {
    const sessionId = get().sessionId;
    const raw = (dirPath || "").trim();
    if (!sessionId || !raw) return;

    const ensureExpanded = opts?.ensureExpanded !== false;
    const loading = new Set(get().loadingPaths);
    loading.add(raw);
    set({ loadingPaths: [...loading], error: null });

    try {
      const result = await fetchDirectory(sessionId, raw, get().showHidden);
      if (get().sessionId !== sessionId) return;
      const resolved = result.path;
      const nextLoading = new Set(get().loadingPaths);
      nextLoading.delete(raw);
      nextLoading.delete(resolved);

      let expandedPaths = get().expandedPaths;
      if (ensureExpanded) {
        const exp = new Set(expandedPaths);
        exp.add(resolved);
        const root = get().rootPath;
        if (root) exp.add(root);
        expandedPaths = [...exp];
      }

      const contentsPath = get().contentsPath;
      const contentsNorm = contentsPath
        ? normalizeRemotePath(contentsPath)
        : null;
      const rawNorm = normalizeRemotePath(raw);
      const patchContents =
        contentsNorm &&
        (contentsNorm === rawNorm || contentsNorm === normalizeRemotePath(resolved));

      set({
        loadingPaths: [...nextLoading],
        childrenCache: {
          ...get().childrenCache,
          [resolved]: result.entries,
        },
        expandedPaths,
        ...(patchContents
          ? {
              contentsPath: resolved,
              selectedPath: resolved,
              selectedPaths: [resolved],
              selectionAnchor: resolved,
            }
          : {}),
      });
    } catch (err) {
      if (get().sessionId !== sessionId) return;
      const nextLoading = new Set(get().loadingPaths);
      nextLoading.delete(raw);
      set({
        loadingPaths: [...nextLoading],
        error: formatAppError(err),
      });
    }
  },

  invalidateSubtree: (path) => {
    const { childrenCache, expandedPaths } = get();
    const nextCache: Record<string, LocalFsEntry[]> = {};
    const prefix = `${path}/`;
    for (const [key, value] of Object.entries(childrenCache)) {
      if (key !== path && !key.startsWith(prefix)) {
        nextCache[key] = value;
      }
    }
    const nextExpanded = expandedPaths.filter(
      (p) => p === path || (p !== path && !p.startsWith(prefix)),
    );
    // Drop cached children for path so the next expand/reload is fresh.
    set({ childrenCache: nextCache, expandedPaths: nextExpanded });
    void get().reloadDirectory(path, { ensureExpanded: true });
  },

  getEntryByPath: (path) => {
    const { childrenCache } = get();
    for (const entries of Object.values(childrenCache)) {
      const hit = entries.find((entry) => entry.path === path);
      if (hit) return hit;
    }
    return null;
  },

  getUploadDirectory: () => {
    const { selectedPath, rootPath, contentsPath } = get();
    if (contentsPath) {
      const contentsEntry = get().getEntryByPath(contentsPath);
      if (!contentsEntry || contentsEntry.kind === "directory") {
        return contentsPath;
      }
    }
    if (!selectedPath) return rootPath;
    const entry = get().getEntryByPath(selectedPath);
    if (entry?.kind === "directory") return entry.path;
    const trimmed = selectedPath.replace(/\/+$/, "");
    const idx = trimmed.lastIndexOf("/");
    if (idx <= 0) return "/";
    return trimmed.slice(0, idx);
  },
}));

subscribeWorkspacePanelWidth((width) => {
  useLocalFsStore.setState({ width });
});

export function closeLocalFs() {
  useLocalFsStore.getState().close();
}

export function openLocalFsPanel(sessionId: string) {
  useLocalFsStore.getState().openPanel(sessionId);
}

import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { PreviewOpenResult } from "../types";
import { useHostStatsStore } from "./hostStatsStore";
import {
  createPreviewTab,
  previewTabId,
  previewTabsForSession,
  type PreviewTab,
} from "./previewTypes";
import { useTaskManagerStore } from "./taskManagerStore";
import { useToastStore } from "./toastStore";
import { flushPreviewEditor } from "../lib/previewEditorFlush";
import { formatAppError } from "../lib/formatAppError";
import i18n from "../i18n";

const PREVIEW_WIDTH_KEY = "terminal-wisely.preview-width";
const PREVIEW_HEIGHT_KEY = "terminal-wisely.preview-height";
const DEFAULT_PREVIEW_WIDTH = 1120;
const DEFAULT_PREVIEW_HEIGHT = 760;
export const PREVIEW_SUDO_REQUIRED = "PREVIEW_SUDO_REQUIRED";

interface SudoPromptState {
  tabId: string;
  sessionId: string;
  path: string;
  action: "open" | "save";
}

export function isSudoRequiredError(message: string): boolean {
  return message.includes(PREVIEW_SUDO_REQUIRED);
}

function updateTab(
  tabs: PreviewTab[],
  tabId: string,
  patch: Partial<PreviewTab>,
): PreviewTab[] {
  return tabs.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab));
}

function getActiveTab(state: { tabs: PreviewTab[]; activeTabId: string | null }) {
  if (!state.activeTabId) return null;
  return state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
}

interface SessionPreviewUi {
  activeTabId: string | null;
  minimized: boolean;
}

interface PreviewState {
  tabs: PreviewTab[];
  activeTabId: string | null;
  focusedSessionId: string | null;
  sessionUi: Record<string, SessionPreviewUi>;
  minimized: boolean;
  width: number;
  height: number;
  maximized: boolean;
  restoreWidth: number | null;
  restoreHeight: number | null;
  sudoPrompt: SudoPromptState | null;
  sudoPassword: string;
  setWidth: (width: number) => void;
  setHeight: (height: number) => void;
  toggleMaximize: () => void;
  minimizePreview: () => void;
  restorePreview: () => void;
  activateTab: (tabId: string) => void;
  syncTerminalSession: (sessionId: string) => void;
  setSearchQuery: (query: string) => void;
  setActiveMatchIndex: (index: number) => void;
  setSearchCaseSensitive: (value: boolean) => void;
  setSearchRegex: (value: boolean) => void;
  setSearchWholeWord: (value: boolean) => void;
  setMarkdownMode: (mode: "source" | "preview") => void;
  setEditedContent: (content: string) => void;
  setSudoPassword: (password: string) => void;
  closeSudoPrompt: () => void;
  submitSudoPassword: () => Promise<void>;
  openPreview: (
    sessionId: string,
    path: string,
    sudoPassword?: string,
  ) => Promise<void>;
  savePreview: (sudoPassword?: string) => Promise<void>;
  closePreview: () => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
}

function patchActiveTab(
  state: PreviewState,
  patch: Partial<PreviewTab>,
): Pick<PreviewState, "tabs"> {
  const activeTabId = state.activeTabId;
  if (!activeTabId) return { tabs: state.tabs };
  return { tabs: updateTab(state.tabs, activeTabId, patch) };
}

function persistSessionUi(
  state: PreviewState,
  sessionId: string,
  patch: Partial<SessionPreviewUi>,
): Record<string, SessionPreviewUi> {
  const previous = state.sessionUi[sessionId];
  return {
    ...state.sessionUi,
    [sessionId]: {
      activeTabId: patch.activeTabId ?? previous?.activeTabId ?? state.activeTabId,
      minimized: patch.minimized ?? previous?.minimized ?? state.minimized,
    },
  };
}

export const usePreviewStore = create<PreviewState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  focusedSessionId: null,
  sessionUi: {},
  minimized: false,
  width: Number(localStorage.getItem(PREVIEW_WIDTH_KEY)) || DEFAULT_PREVIEW_WIDTH,
  height: Number(localStorage.getItem(PREVIEW_HEIGHT_KEY)) || DEFAULT_PREVIEW_HEIGHT,
  maximized: false,
  restoreWidth: null,
  restoreHeight: null,
  sudoPrompt: null,
  sudoPassword: "",

  setWidth: (width) => {
    const max = Math.min(1600, window.innerWidth - 48);
    const next = Math.max(520, Math.min(width, max));
    localStorage.setItem(PREVIEW_WIDTH_KEY, String(next));
    set({ width: next });
  },

  setHeight: (height) => {
    const max = Math.min(1200, window.innerHeight - 48);
    const next = Math.max(360, Math.min(height, max));
    localStorage.setItem(PREVIEW_HEIGHT_KEY, String(next));
    set({ height: next });
  },

  toggleMaximize: () => {
    const state = get();
    if (state.maximized) {
      const width = state.restoreWidth ?? DEFAULT_PREVIEW_WIDTH;
      const height = state.restoreHeight ?? DEFAULT_PREVIEW_HEIGHT;
      localStorage.setItem(PREVIEW_WIDTH_KEY, String(width));
      localStorage.setItem(PREVIEW_HEIGHT_KEY, String(height));
      set({
        maximized: false,
        width,
        height,
        restoreWidth: null,
        restoreHeight: null,
      });
      return;
    }

    set({
      maximized: true,
      restoreWidth: state.width,
      restoreHeight: state.height,
    });
  },

  minimizePreview: () => {
    const state = get();
    const tab = getActiveTab(state);
    if (!tab) return;
    set({
      minimized: true,
      maximized: false,
      sessionUi: persistSessionUi(state, tab.sessionId, { minimized: true }),
    });
  },

  restorePreview: () => {
    const state = get();
    const tab = getActiveTab(state);
    if (!tab) return;
    set({
      minimized: false,
      sessionUi: persistSessionUi(state, tab.sessionId, { minimized: false }),
    });
  },

  activateTab: (tabId) => {
    const tab = get().tabs.find((item) => item.id === tabId);
    if (!tab) return;
    set((state) => ({
      activeTabId: tabId,
      minimized: false,
      sessionUi: persistSessionUi(state, tab.sessionId, {
        activeTabId: tabId,
        minimized: false,
      }),
    }));
  },

  syncTerminalSession: (sessionId) => {
    const state = get();

    let sessionUi = state.sessionUi;
    if (state.focusedSessionId && state.focusedSessionId !== sessionId) {
      const active = getActiveTab(state);
      if (active?.sessionId === state.focusedSessionId) {
        const previous = state.sessionUi[state.focusedSessionId];
        const snapshot = {
          activeTabId: state.activeTabId,
          minimized: state.minimized,
        };
        if (
          !previous ||
          previous.activeTabId !== snapshot.activeTabId ||
          previous.minimized !== snapshot.minimized
        ) {
          sessionUi = {
            ...state.sessionUi,
            [state.focusedSessionId]: snapshot,
          };
        }
      }
    }

    const sessionTabs = previewTabsForSession(state.tabs, sessionId);
    const saved = sessionUi[sessionId];
    let nextActiveId = state.activeTabId;
    let nextMinimized = true;

    if (sessionTabs.length > 0) {
      const savedId = saved?.activeTabId;
      nextActiveId =
        savedId && sessionTabs.some((tab) => tab.id === savedId)
          ? savedId
          : sessionTabs[sessionTabs.length - 1]!.id;
      nextMinimized = saved?.minimized ?? false;
    }

    const nextActiveTabId =
      sessionTabs.length > 0 ? nextActiveId : state.activeTabId;

    if (
      state.focusedSessionId === sessionId &&
      state.activeTabId === nextActiveTabId &&
      state.minimized === nextMinimized &&
      !state.maximized &&
      sessionUi === state.sessionUi
    ) {
      return;
    }

    set({
      focusedSessionId: sessionId,
      sessionUi,
      activeTabId: nextActiveTabId,
      minimized: nextMinimized,
      maximized: false,
    });
  },

  setSearchQuery: (query) =>
    set((state) => patchActiveTab(state, { searchQuery: query, activeMatchIndex: 0 })),

  setActiveMatchIndex: (index) =>
    set((state) => patchActiveTab(state, { activeMatchIndex: index })),

  setSearchCaseSensitive: (value) =>
    set((state) =>
      patchActiveTab(state, { searchCaseSensitive: value, activeMatchIndex: 0 }),
    ),

  setSearchRegex: (value) =>
    set((state) => patchActiveTab(state, { searchRegex: value, activeMatchIndex: 0 })),

  setSearchWholeWord: (value) =>
    set((state) =>
      patchActiveTab(state, { searchWholeWord: value, activeMatchIndex: 0 }),
    ),

  setMarkdownMode: (mode) =>
    set((state) => patchActiveTab(state, { markdownMode: mode })),

  setEditedContent: (content) =>
    set((state) => patchActiveTab(state, { editedContent: content })),

  setSudoPassword: (password) => set({ sudoPassword: password }),

  closeSudoPrompt: () => set({ sudoPrompt: null, sudoPassword: "" }),

  submitSudoPassword: async () => {
    const { sudoPrompt, sudoPassword } = get();
    if (!sudoPrompt || !sudoPassword.trim()) {
      useToastStore.getState().pushToast(i18n.t("preview:toastNeedSudoPassword"), false);
      return;
    }

    if (sudoPrompt.action === "open") {
      await get().openPreview(
        sudoPrompt.sessionId,
        sudoPrompt.path,
        sudoPassword,
      );
    } else {
      await get().savePreview(sudoPassword);
    }
  },

  openPreview: async (sessionId, path, sudoPassword) => {
    useTaskManagerStore.getState().close();
    useHostStatsStore.getState().close();

    const id = previewTabId(sessionId, path);
    const existing = get().tabs.find((tab) => tab.id === id);
    if (existing?.data && !existing.loading) {
      set((state) => ({
        activeTabId: id,
        focusedSessionId: sessionId,
        minimized: false,
        sudoPrompt: null,
        sudoPassword: "",
        sessionUi: persistSessionUi(state, sessionId, {
          activeTabId: id,
          minimized: false,
        }),
      }));
      return;
    }

    if (!existing) {
      const newTab = createPreviewTab(sessionId, path);
      set((state) => ({
        tabs: [...state.tabs, newTab],
        activeTabId: id,
        focusedSessionId: sessionId,
        minimized: false,
        sudoPrompt: null,
        sudoPassword: "",
        sessionUi: persistSessionUi(state, sessionId, {
          activeTabId: id,
          minimized: false,
        }),
      }));
    } else {
      set((state) => ({
        activeTabId: id,
        focusedSessionId: sessionId,
        minimized: false,
        sudoPrompt: null,
        sudoPassword: "",
        tabs: updateTab(state.tabs, id, { loading: true, error: null }),
        sessionUi: persistSessionUi(state, sessionId, {
          activeTabId: id,
          minimized: false,
        }),
      }));
    }

    try {
      const result = await invoke<PreviewOpenResult>("preview_open", {
        request: {
          session_id: sessionId,
          path,
          sudo_password: sudoPassword ?? null,
        },
      });
      set((state) => ({
        tabs: updateTab(state.tabs, id, {
          data: result,
          loading: false,
          error: null,
        }),
      }));
    } catch (err) {
      const message = String(err);
      if (isSudoRequiredError(message)) {
        set({
          sudoPrompt: { tabId: id, sessionId, path, action: "open" },
          sudoPassword: "",
          tabs: updateTab(get().tabs, id, { loading: false, error: null }),
        });
        return;
      }
      const formatted = formatAppError(err);
      set((state) => ({
        tabs: updateTab(state.tabs, id, { loading: false, error: formatted }),
      }));
      useToastStore.getState().pushToast(formatted, false);
    }
  },

  savePreview: async (sudoPassword) => {
    const state = get();
    const tab = getActiveTab(state);
    if (!tab?.data?.handle_id || !tab.data.editable || tab.saving) return;

    const flushed = flushPreviewEditor(tab.id);
    const content =
      flushed ?? tab.editedContent ?? tab.data.text_content ?? "";
    set((current) => ({
      tabs: updateTab(current.tabs, tab.id, { saving: true }),
      sudoPrompt: null,
    }));

    try {
      const result = await invoke<PreviewOpenResult>("preview_save", {
        request: {
          handle_id: tab.data.handle_id,
          content,
          sudo_password: sudoPassword ?? null,
        },
      });
      set((current) => ({
        tabs: updateTab(current.tabs, tab.id, {
          data: result,
          editedContent: null,
          saving: false,
          error: null,
        }),
        sudoPrompt: null,
        sudoPassword: "",
      }));
      useToastStore.getState().pushToast(i18n.t("preview:toastSaved"), true);
    } catch (err) {
      const message = String(err);
      if (isSudoRequiredError(message)) {
        set({
          tabs: updateTab(get().tabs, tab.id, { saving: false }),
          sudoPrompt: {
            tabId: tab.id,
            sessionId: tab.sessionId,
            path: tab.path,
            action: "save",
          },
          sudoPassword: "",
        });
        return;
      }
      set((current) => ({
        tabs: updateTab(current.tabs, tab.id, { saving: false }),
      }));
      useToastStore.getState().pushToast(formatAppError(err), false);
    }
  },

  closeTab: async (tabId) => {
    const state = get();
    const tab = state.tabs.find((item) => item.id === tabId);
    if (!tab) return;

    const flushed = flushPreviewEditor(tabId);
    const effectiveContent =
      flushed ?? tab.editedContent ?? tab.data?.text_content ?? "";
    const saved = tab.data?.text_content ?? "";
    if (effectiveContent !== saved) {
      const label = tab.data?.filename ?? tab.path;
      const confirmed = window.confirm(
        i18n.t("preview:confirmCloseDirty", { label }),
      );
      if (!confirmed) return;
    }

    if (tab.data?.handle_id) {
      await invoke("preview_close", {
        request: { handle_id: tab.data.handle_id },
      }).catch(() => undefined);
    }

    const nextTabs = state.tabs.filter((item) => item.id !== tabId);
    let nextActiveId = state.activeTabId;
    if (state.activeTabId === tabId) {
      const sessionTabs = previewTabsForSession(state.tabs, tab.sessionId);
      const sessionNextTabs = previewTabsForSession(nextTabs, tab.sessionId);
      const closedIndex = sessionTabs.findIndex((item) => item.id === tabId);
      const fallback =
        sessionNextTabs[closedIndex] ?? sessionNextTabs[closedIndex - 1] ?? null;
      nextActiveId = fallback?.id ?? null;
    }

    let sessionUi = { ...state.sessionUi };
    if (sessionUi[tab.sessionId]?.activeTabId === tabId) {
      sessionUi = {
        ...sessionUi,
        [tab.sessionId]: {
          ...sessionUi[tab.sessionId],
          activeTabId: nextActiveId,
        },
      };
    }

    if (nextTabs.length === 0) {
      set({
        tabs: [],
        activeTabId: null,
        focusedSessionId: null,
        sessionUi: {},
        minimized: false,
        maximized: false,
        restoreWidth: null,
        restoreHeight: null,
        sudoPrompt: null,
        sudoPassword: "",
      });
      return;
    }

    set({
      tabs: nextTabs,
      activeTabId: nextActiveId,
      minimized:
        state.focusedSessionId === tab.sessionId && nextActiveId == null
          ? true
          : state.minimized,
      sessionUi,
      sudoPrompt: state.sudoPrompt?.tabId === tabId ? null : state.sudoPrompt,
      sudoPassword: state.sudoPrompt?.tabId === tabId ? "" : state.sudoPassword,
    });
  },

  closePreview: async () => {
    const { activeTabId } = get();
    if (!activeTabId) return;
    await get().closeTab(activeTabId);
  },
}));

export function useActivePreviewTab(sessionId?: string | null) {
  return usePreviewStore((state) => {
    if (!state.activeTabId) return null;
    const tab = state.tabs.find((item) => item.id === state.activeTabId) ?? null;
    if (!tab) return null;
    if (sessionId && tab.sessionId !== sessionId) return null;
    return tab;
  });
}

export function usePreviewTabsForSession(sessionId: string) {
  return usePreviewStore(
    useShallow((state) => previewTabsForSession(state.tabs, sessionId)),
  );
}

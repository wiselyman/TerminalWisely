import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { PreviewOpenResult } from "../types";
import { useHostStatsStore } from "./hostStatsStore";
import { useTaskManagerStore } from "./taskManagerStore";
import { useToastStore } from "./toastStore";

const PREVIEW_WIDTH_KEY = "terminal-wisely.preview-width";
const DEFAULT_PREVIEW_WIDTH = 420;
export const PREVIEW_SUDO_REQUIRED = "PREVIEW_SUDO_REQUIRED";

interface SudoPromptState {
  sessionId: string;
  path: string;
  action: "open" | "save";
}

function isSudoRequiredError(message: string): boolean {
  return message.includes(PREVIEW_SUDO_REQUIRED);
}

interface PreviewState {
  open: boolean;
  width: number;
  loading: boolean;
  saving: boolean;
  error: string | null;
  data: PreviewOpenResult | null;
  editedContent: string | null;
  searchQuery: string;
  activeMatchIndex: number;
  searchCaseSensitive: boolean;
  searchRegex: boolean;
  searchWholeWord: boolean;
  markdownMode: "source" | "preview";
  sudoPrompt: SudoPromptState | null;
  sudoPassword: string;
  setWidth: (width: number) => void;
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
}

export const usePreviewStore = create<PreviewState>((set, get) => ({
  open: false,
  width: Number(localStorage.getItem(PREVIEW_WIDTH_KEY)) || DEFAULT_PREVIEW_WIDTH,
  loading: false,
  saving: false,
  error: null,
  data: null,
  editedContent: null,
  searchQuery: "",
  activeMatchIndex: 0,
  searchCaseSensitive: false,
  searchRegex: false,
  searchWholeWord: false,
  markdownMode: "source",
  sudoPrompt: null,
  sudoPassword: "",

  setWidth: (width) => {
    const next = Math.max(280, Math.min(width, 900));
    localStorage.setItem(PREVIEW_WIDTH_KEY, String(next));
    set({ width: next });
  },

  setSearchQuery: (query) => set({ searchQuery: query, activeMatchIndex: 0 }),

  setActiveMatchIndex: (index) => set({ activeMatchIndex: index }),

  setSearchCaseSensitive: (value) =>
    set({ searchCaseSensitive: value, activeMatchIndex: 0 }),

  setSearchRegex: (value) => set({ searchRegex: value, activeMatchIndex: 0 }),

  setSearchWholeWord: (value) =>
    set({ searchWholeWord: value, activeMatchIndex: 0 }),

  setMarkdownMode: (mode) => set({ markdownMode: mode }),

  setEditedContent: (content) => set({ editedContent: content }),

  setSudoPassword: (password) => set({ sudoPassword: password }),

  closeSudoPrompt: () => set({ sudoPrompt: null, sudoPassword: "" }),

  submitSudoPassword: async () => {
    const { sudoPrompt, sudoPassword } = get();
    if (!sudoPrompt || !sudoPassword.trim()) {
      useToastStore.getState().pushToast("请输入 sudo 密码", false);
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

    set({
      open: true,
      loading: true,
      error: null,
      editedContent: null,
      searchQuery: "",
      activeMatchIndex: 0,
      searchCaseSensitive: false,
      searchRegex: false,
      searchWholeWord: false,
      markdownMode: "source",
      sudoPrompt: null,
      sudoPassword: "",
    });

    try {
      const previous = get().data;
      if (previous?.handle_id) {
        await invoke("preview_close", {
          request: { handle_id: previous.handle_id },
        }).catch(() => undefined);
      }

      const result = await invoke<PreviewOpenResult>("preview_open", {
        request: {
          session_id: sessionId,
          path,
          sudo_password: sudoPassword ?? null,
        },
      });
      set({
        data: result,
        loading: false,
        error: null,
        open: true,
        sudoPrompt: null,
        sudoPassword: "",
      });
    } catch (err) {
      const message = String(err);
      if (isSudoRequiredError(message)) {
        set({
          loading: false,
          error: null,
          open: true,
          sudoPrompt: { sessionId, path, action: "open" },
          sudoPassword: "",
        });
        return;
      }
      set({ loading: false, error: message, open: true });
      useToastStore.getState().pushToast(message, false);
    }
  },

  savePreview: async (sudoPassword) => {
    const { data, editedContent, saving } = get();
    if (!data?.handle_id || !data.editable || saving) return;

    const content = editedContent ?? data.text_content ?? "";
    set({ saving: true, sudoPrompt: null });

    try {
      const result = await invoke<PreviewOpenResult>("preview_save", {
        request: {
          handle_id: data.handle_id,
          content,
          sudo_password: sudoPassword ?? null,
        },
      });
      set({
        data: result,
        editedContent: null,
        saving: false,
        error: null,
        sudoPrompt: null,
        sudoPassword: "",
      });
      useToastStore.getState().pushToast("已保存", true);
    } catch (err) {
      const message = String(err);
      if (isSudoRequiredError(message)) {
        set({
          saving: false,
          sudoPrompt: {
            sessionId: data.session_id,
            path: data.resolved_path,
            action: "save",
          },
          sudoPassword: "",
        });
        return;
      }
      set({ saving: false });
      useToastStore.getState().pushToast(message, false);
    }
  },

  closePreview: async () => {
    const handleId = get().data?.handle_id;
    if (handleId) {
      await invoke("preview_close", {
        request: { handle_id: handleId },
      }).catch(() => undefined);
    }
    set({
      open: false,
      loading: false,
      saving: false,
      error: null,
      data: null,
      editedContent: null,
      searchQuery: "",
      activeMatchIndex: 0,
      sudoPrompt: null,
      sudoPassword: "",
    });
  },
}));

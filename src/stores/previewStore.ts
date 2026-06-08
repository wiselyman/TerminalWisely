import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { PreviewOpenResult } from "../types";
import { useToastStore } from "./toastStore";

const PREVIEW_WIDTH_KEY = "terminal-wisely.preview-width";
const DEFAULT_PREVIEW_WIDTH = 420;

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
  setWidth: (width: number) => void;
  setSearchQuery: (query: string) => void;
  setActiveMatchIndex: (index: number) => void;
  setSearchCaseSensitive: (value: boolean) => void;
  setSearchRegex: (value: boolean) => void;
  setSearchWholeWord: (value: boolean) => void;
  setMarkdownMode: (mode: "source" | "preview") => void;
  setEditedContent: (content: string) => void;
  openPreview: (sessionId: string, path: string) => Promise<void>;
  savePreview: () => Promise<void>;
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

  openPreview: async (sessionId, path) => {
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
    });

    try {
      const previous = get().data;
      if (previous?.handle_id) {
        await invoke("preview_close", {
          request: { handle_id: previous.handle_id },
        }).catch(() => undefined);
      }

      const result = await invoke<PreviewOpenResult>("preview_open", {
        request: { session_id: sessionId, path },
      });
      set({ data: result, loading: false, error: null, open: true });
    } catch (err) {
      const message = String(err);
      set({ loading: false, error: message, open: true });
      useToastStore.getState().pushToast(message, false);
    }
  },

  savePreview: async () => {
    const { data, editedContent, saving } = get();
    if (!data?.handle_id || !data.editable || saving) return;

    const content = editedContent ?? data.text_content ?? "";
    set({ saving: true });

    try {
      const result = await invoke<PreviewOpenResult>("preview_save", {
        request: { handle_id: data.handle_id, content },
      });
      set({
        data: result,
        editedContent: null,
        saving: false,
        error: null,
      });
      useToastStore.getState().pushToast("已保存", true);
    } catch (err) {
      const message = String(err);
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
    });
  },
}));

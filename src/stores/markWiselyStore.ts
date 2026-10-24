import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { PreviewOpenResult } from "../types";

const RECENTS_KEY = "terminal-wisely.markwisely-recents.v1";
const MAX_RECENT_FILES = 12;

export interface MarkWiselyRecentFile {
  path: string;
  lastOpened: number;
}

export interface MarkWiselyDocument {
  sessionId: string;
  hostKey: string;
  path: string;
  handleId: string;
  text: string;
  savedText: string;
  saving: boolean;
  error: string | null;
}

type RecentFilesByHost = Record<string, MarkWiselyRecentFile[]>;

interface OpenDocumentOptions {
  sessionId: string;
  hostKey: string;
  path: string;
}

interface CreateDocumentOptions extends OpenDocumentOptions {
  parentDir: string;
  name: string;
}

interface MarkWiselyState {
  documents: Record<string, MarkWiselyDocument | null>;
  recentFiles: RecentFilesByHost;
  openDocument: (options: OpenDocumentOptions) => Promise<void>;
  createDocument: (options: CreateDocumentOptions) => Promise<void>;
  setEditorValue: (sessionId: string, value: string) => void;
  saveDocument: (sessionId: string) => Promise<void>;
  closeDocument: (sessionId: string) => Promise<void>;
  getDocument: (sessionId: string) => MarkWiselyDocument | null;
  getRecentFiles: (hostKey: string) => MarkWiselyRecentFile[];
}

function readRecentFiles(): RecentFilesByHost {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: RecentFilesByHost = {};
    for (const [hostKey, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      result[hostKey] = value
        .filter(
          (item): item is MarkWiselyRecentFile =>
            !!item &&
            typeof item === "object" &&
            typeof (item as MarkWiselyRecentFile).path === "string" &&
            typeof (item as MarkWiselyRecentFile).lastOpened === "number",
        )
        .slice(0, MAX_RECENT_FILES);
    }
    return result;
  } catch {
    return {};
  }
}

function persistRecentFiles(files: RecentFilesByHost) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(files));
  } catch {
    // Recent files are a convenience and must not block editing.
  }
}

function withRecentFile(
  recentFiles: RecentFilesByHost,
  hostKey: string,
  path: string,
): RecentFilesByHost {
  const updated = {
    path,
    lastOpened: Date.now(),
  };
  const next = {
    ...recentFiles,
    [hostKey]: [
      updated,
      ...(recentFiles[hostKey] ?? []).filter((item) => item.path !== path),
    ].slice(0, MAX_RECENT_FILES),
  };
  persistRecentFiles(next);
  return next;
}

async function openRemoteMarkdown(
  options: OpenDocumentOptions,
): Promise<PreviewOpenResult> {
  const result = await invoke<PreviewOpenResult>("preview_open", {
    request: {
      session_id: options.sessionId,
      path: options.path,
      sudo_password: null,
    },
  });
  if (result.kind !== "markdown") {
    await invoke("preview_close", { request: { handle_id: result.handle_id } });
    throw new Error("The selected file is not Markdown.");
  }
  return result;
}

export const useMarkWiselyStore = create<MarkWiselyState>((set, get) => ({
  documents: {},
  recentFiles: readRecentFiles(),

  openDocument: async ({ sessionId, hostKey, path }) => {
    const result = await openRemoteMarkdown({ sessionId, hostKey, path });
    const previous = get().documents[sessionId];
    if (previous && previous.handleId !== result.handle_id) {
      void invoke("preview_close", {
        request: { handle_id: previous.handleId },
      }).catch(() => undefined);
    }
    const text = result.text_content ?? "";
    set((state) => ({
      documents: {
        ...state.documents,
        [sessionId]: {
          sessionId,
          hostKey,
          path: result.resolved_path,
          handleId: result.handle_id,
          text,
          savedText: text,
          saving: false,
          error: null,
        },
      },
      recentFiles: withRecentFile(state.recentFiles, hostKey, result.resolved_path),
    }));
  },

  createDocument: async ({ sessionId, hostKey, parentDir, name, path }) => {
    await invoke("create_path", {
      request: {
        session_id: sessionId,
        parent_dir: parentDir,
        name,
        kind: "file",
        sudo_password: null,
      },
    });
    await get().openDocument({ sessionId, hostKey, path });
  },

  setEditorValue: (sessionId, value) => {
    set((state) => {
      const document = state.documents[sessionId];
      if (!document) return state;
      return {
        documents: {
          ...state.documents,
          [sessionId]: { ...document, text: value, error: null },
        },
      };
    });
  },

  saveDocument: async (sessionId) => {
    const document = get().documents[sessionId];
    if (!document || document.saving) return;
    const savedText = document.text;
    set((state) => ({
      documents: {
        ...state.documents,
        [sessionId]: { ...document, saving: true, error: null },
      },
    }));
    try {
      await invoke("preview_save", {
        request: {
          handle_id: document.handleId,
          content: savedText,
          sudo_password: null,
        },
      });
      set((state) => {
        const current = state.documents[sessionId];
        if (!current) return state;
        return {
          documents: {
            ...state.documents,
            [sessionId]: {
              ...current,
              savedText,
              saving: false,
              error: null,
            },
          },
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set((state) => {
        const current = state.documents[sessionId];
        if (!current) return state;
        return {
          documents: {
            ...state.documents,
            [sessionId]: { ...current, saving: false, error: message },
          },
        };
      });
      throw error;
    }
  },

  closeDocument: async (sessionId) => {
    const document = get().documents[sessionId];
    if (!document) return;
    await invoke("preview_close", {
      request: { handle_id: document.handleId },
    }).catch(() => undefined);
    set((state) => ({
      documents: { ...state.documents, [sessionId]: null },
    }));
  },

  getDocument: (sessionId) => get().documents[sessionId] ?? null,
  getRecentFiles: (hostKey) => get().recentFiles[hostKey] ?? [],
}));

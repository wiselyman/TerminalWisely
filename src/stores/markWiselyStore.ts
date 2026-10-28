import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { PreviewOpenResult } from "../types";
import { desktopTargetKey, type DesktopTarget } from "../lib/desktopTarget";
import { createLocalPath, readLocalText, writeLocalText } from "../lib/localFsApi";

const RECENTS_KEY = "terminal-wisely.markwisely-recents.v1";
const MAX_RECENT_FILES = 12;
const activeSaves = new Map<string, Promise<void>>();

export interface MarkWiselyRecentFile {
  path: string;
  lastOpened: number;
}

export interface MarkWiselyDocument {
  sessionId: string | null;
  target: DesktopTarget;
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
  sessionId?: string;
  target?: DesktopTarget;
  hostKey: string;
  path: string;
}

interface CreateDocumentOptions extends OpenDocumentOptions {
  parentDir: string;
  name: string;
}

function documentKey(options: Pick<OpenDocumentOptions, "sessionId" | "target">): string {
  if (options.target) return desktopTargetKey(options.target);
  return options.sessionId ?? "";
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

  openDocument: async (options) => {
    const { sessionId, hostKey, path } = options;
    const target = options.target ?? { kind: "ssh" as const, sessionId: sessionId ?? "" };
    const key = documentKey(options);
    let resolvedPath = path;
    let handleId = "";
    let text = "";
    if (target.kind === "local") {
      text = await readLocalText(path);
    } else {
      if (!sessionId) throw new Error("SSH session is required");
      const result = await openRemoteMarkdown({ sessionId, hostKey, path });
      resolvedPath = result.resolved_path;
      handleId = result.handle_id;
      text = result.text_content ?? "";
    }
    const previous = get().documents[key];
    if (target.kind === "ssh" && previous && previous.handleId !== handleId) {
      void invoke("preview_close", {
        request: { handle_id: previous.handleId },
      }).catch(() => undefined);
    }
    set((state) => ({
      documents: {
        ...state.documents,
        [key]: {
          sessionId: sessionId ?? null,
          target,
          hostKey,
          path: resolvedPath,
          handleId,
          text,
          savedText: text,
          saving: false,
          error: null,
        },
      },
      recentFiles: withRecentFile(state.recentFiles, target.kind === "local" ? "local" : hostKey, resolvedPath),
    }));
  },

  createDocument: async (options) => {
    const { sessionId, hostKey, parentDir, name, path } = options;
    const target = options.target ?? { kind: "ssh" as const, sessionId: sessionId ?? "" };
    if (target.kind === "local") {
      await createLocalPath(parentDir, name, "file");
    } else {
      if (!sessionId) throw new Error("SSH session is required");
      await invoke("create_path", {
        request: {
          session_id: sessionId,
          parent_dir: parentDir,
          name,
          kind: "file",
          sudo_password: null,
        },
      });
    }
    await get().openDocument({ sessionId, ...(options.target ? { target } : {}), hostKey, path });
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

  saveDocument: (sessionId) => {
    const active = activeSaves.get(sessionId);
    if (active) return active;
    const initial = get().documents[sessionId];
    if (!initial) return Promise.resolve();

    const save = (async () => {
      set((state) => {
        const current = state.documents[sessionId];
        if (!current) return state;
        return {
          documents: {
            ...state.documents,
            [sessionId]: { ...current, saving: true, error: null },
          },
        };
      });
      try {
        while (true) {
          const current = get().documents[sessionId];
          if (!current || current.text === current.savedText) break;
          const savedText = current.text;
          if (current.target.kind === "local") {
            await writeLocalText(current.path, savedText);
          } else {
            await invoke("preview_save", {
              request: {
                handle_id: current.handleId,
                content: savedText,
                sudo_password: null,
              },
            });
          }
          set((state) => {
            const latest = state.documents[sessionId];
            if (!latest) return state;
            return {
              documents: {
                ...state.documents,
                [sessionId]: { ...latest, savedText, error: null },
              },
            };
          });
        }
        set((state) => {
          const current = state.documents[sessionId];
          if (!current) return state;
          return {
            documents: {
              ...state.documents,
              [sessionId]: { ...current, saving: false },
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
    })();
    activeSaves.set(sessionId, save);
    void save.finally(() => {
      if (activeSaves.get(sessionId) === save) activeSaves.delete(sessionId);
    }).catch(() => undefined);
    return save;
  },

  closeDocument: async (sessionId) => {
    const document = get().documents[sessionId];
    if (!document) return;
    if (document.target.kind === "ssh") {
      await invoke("preview_close", {
        request: { handle_id: document.handleId },
      }).catch(() => undefined);
    }
    set((state) => ({
      documents: { ...state.documents, [sessionId]: null },
    }));
  },

  getDocument: (sessionId) => get().documents[sessionId] ?? null,
  getRecentFiles: (hostKey) => get().recentFiles[hostKey] ?? [],
}));

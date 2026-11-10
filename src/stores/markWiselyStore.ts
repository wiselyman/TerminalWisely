import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { PreviewOpenResult } from "../types";
import { desktopTargetKey, type DesktopTarget } from "../lib/desktopTarget";
import { createLocalPath, readLocalText, writeLocalText } from "../lib/localFsApi";
import {
  readMarkWiselyDraft,
  removeMarkWiselyDraft,
  saveMarkWiselyDraft,
} from "../lib/markWiselyRecovery";

const RECENTS_KEY = "terminal-wisely.markwisely-recents.v1";
const MAX_RECENT_FILES = 12;
const activeSaves = new Map<string, Promise<void>>();
const recoveryTimers = new Map<string, ReturnType<typeof setTimeout>>();

function recoveryScope(target: DesktopTarget, hostKey: string): string {
  return target.kind === "local" ? "local" : hostKey;
}

function recoveryTimerKey(scope: string, path: string): string {
  return JSON.stringify([scope, path]);
}

export interface MarkWiselyRecentFile {
  path: string;
  lastOpened: number;
}

export interface MarkWiselyDocument {
  documentId: string;
  sessionId: string | null;
  target: DesktopTarget;
  hostKey: string;
  path: string;
  handleId: string;
  text: string;
  savedText: string;
  saving: boolean;
  error: string | null;
  recoveryText: string | null;
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

interface SaveAsDocumentOptions {
  key: string;
  parentDir: string;
  name: string;
}

function documentKey(options: Pick<OpenDocumentOptions, "sessionId" | "target">): string {
  if (options.target) return desktopTargetKey(options.target);
  return options.sessionId ?? "";
}

interface MarkWiselyState {
  documents: Record<string, MarkWiselyDocument | null>;
  openDocuments: Record<string, MarkWiselyDocument[]>;
  activeDocumentIds: Record<string, string | null>;
  recentFiles: RecentFilesByHost;
  openDocument: (options: OpenDocumentOptions) => Promise<void>;
  createDocument: (options: CreateDocumentOptions) => Promise<void>;
  saveAsDocument: (options: SaveAsDocumentOptions) => Promise<void>;
  setEditorValue: (sessionId: string, value: string, documentId?: string) => void;
  saveDocument: (sessionId: string, documentId?: string) => Promise<void>;
  closeDocument: (sessionId: string, documentId?: string) => Promise<void>;
  getDocument: (sessionId: string) => MarkWiselyDocument | null;
  getDocuments: (sessionId: string) => MarkWiselyDocument[];
  activateDocument: (sessionId: string, documentId: string) => void;
  restoreDraft: (sessionId: string, documentId: string) => void;
  discardDraft: (sessionId: string, documentId: string) => void;
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
  openDocuments: {},
  activeDocumentIds: {},
  recentFiles: readRecentFiles(),

  openDocument: async (options) => {
    const { sessionId, hostKey, path } = options;
    const target = options.target ?? { kind: "ssh" as const, sessionId: sessionId ?? "" };
    const key = documentKey(options);
    const alreadyOpen = (get().openDocuments[key] ?? []).find((document) => document.path === path);
    if (alreadyOpen) {
      get().activateDocument(key, alreadyOpen.documentId);
      return;
    }
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
    const documentId = `${key}:${resolvedPath}`;
    const previous = get().openDocuments[key] ?? [];
    const replaced = previous.find((document) => document.path === resolvedPath);
    if (target.kind === "ssh" && replaced && replaced.handleId !== handleId) {
      void invoke("preview_close", {
        request: { handle_id: replaced.handleId },
      }).catch(() => undefined);
    }
    const document: MarkWiselyDocument = {
      documentId,
      sessionId: sessionId ?? null,
      target,
      hostKey,
      path: resolvedPath,
      handleId,
      text,
      savedText: text,
      saving: false,
      error: null,
      recoveryText: (() => {
        const draft = readMarkWiselyDraft(localStorage, recoveryScope(target, hostKey), resolvedPath);
        return draft && draft.text !== text ? draft.text : null;
      })(),
    };
    const documents = [...previous.filter((item) => item.path !== resolvedPath), document];
    set((state) => ({
      documents: {
        ...state.documents,
        [key]: document,
      },
      openDocuments: { ...state.openDocuments, [key]: documents },
      activeDocumentIds: { ...state.activeDocumentIds, [key]: documentId },
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

  saveAsDocument: async ({ key, parentDir, name }) => {
    const source = get().documents[key];
    if (!source) throw new Error("No Markdown document is open");
    const separator = parentDir.includes("\\") ? "\\" : "/";
    const normalizedParent = parentDir.replace(/[/\\]+$/, "");
    const path = `${normalizedParent}${normalizedParent ? separator : ""}${name}`;
    const content = source.text;

    if (source.target.kind === "local") {
      await createLocalPath(parentDir, name, "file");
      try {
        await writeLocalText(path, content);
      } catch (error) {
        await invoke("delete_local_path", { request: { path } }).catch(() => undefined);
        throw error;
      }
      set((state) => ({
        documents: {
          ...state.documents,
          [key]: { ...source, path, handleId: "", text: content, savedText: content, saving: false, error: null },
        },
        recentFiles: withRecentFile(state.recentFiles, "local", path),
      }));
      return;
    }

    const sessionId = source.sessionId;
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
    let copiedHandleId: string | null = null;
    try {
      const opened = await openRemoteMarkdown({
        sessionId,
        hostKey: source.hostKey,
        path,
      });
      copiedHandleId = opened.handle_id;
      await invoke("preview_save", {
        request: {
          handle_id: opened.handle_id,
          content,
          sudo_password: null,
        },
      });
    } catch (error) {
      if (copiedHandleId) {
        await invoke("preview_close", { request: { handle_id: copiedHandleId } }).catch(() => undefined);
      }
      await invoke("delete_path", {
        request: { session_id: sessionId, path, sudo_password: null },
      }).catch(() => undefined);
      throw error;
    }

    const copiedDocument: MarkWiselyDocument = {
      ...source,
      path,
      handleId: copiedHandleId ?? "",
      text: content,
      savedText: content,
      saving: false,
      error: null,
    };
    set((state) => {
      const currentDocuments = state.openDocuments[key] ?? [];
      const updatedDocuments = currentDocuments.map((document) =>
        document.documentId === source.documentId
          ? { ...document, path, handleId: "", text: content, savedText: content, saving: false, error: null }
          : document,
      );
      const activeDocument = state.activeDocumentIds[key] === source.documentId
        ? updatedDocuments.find((document) => document.documentId === source.documentId) ?? null
        : state.documents[key];
      return {
        documents: { ...state.documents, [key]: activeDocument ?? copiedDocument },
        openDocuments: { ...state.openDocuments, [key]: updatedDocuments },
        recentFiles: withRecentFile(state.recentFiles, source.hostKey, path),
      };
    });
    if (source.handleId && source.handleId !== copiedHandleId) {
      void invoke("preview_close", { request: { handle_id: source.handleId } }).catch(() => undefined);
    }
  },

  setEditorValue: (sessionId, value, documentId) => {
    set((state) => {
      const document = documentId
        ? (state.openDocuments[sessionId] ?? []).find((item) => item.documentId === documentId) ?? null
        : state.documents[sessionId];
      if (!document) return state;
      const updated = { ...document, text: value, error: null };
      const openDocuments = (state.openDocuments[sessionId] ?? []).map((item) =>
        item.documentId === document.documentId ? updated : item,
      );
      return {
        openDocuments: { ...state.openDocuments, [sessionId]: openDocuments },
        documents: {
          ...state.documents,
          ...(state.activeDocumentIds[sessionId] === document.documentId ? { [sessionId]: updated } : {}),
        },
      };
    });
    const document = documentId
      ? (get().openDocuments[sessionId] ?? []).find((item) => item.documentId === documentId)
      : get().documents[sessionId];
    if (!document) return;
    const scope = recoveryScope(document.target, document.hostKey);
    const key = recoveryTimerKey(scope, document.path);
    const oldTimer = recoveryTimers.get(key);
    if (oldTimer) clearTimeout(oldTimer);
    if (document.text === document.savedText) {
      recoveryTimers.delete(key);
      removeMarkWiselyDraft(localStorage, scope, document.path);
      return;
    }
    recoveryTimers.set(key, setTimeout(() => {
      recoveryTimers.delete(key);
      const latest = (get().openDocuments[sessionId] ?? []).find((item) => item.documentId === document.documentId);
      if (!latest || latest.text === latest.savedText) return;
      if (!saveMarkWiselyDraft(localStorage, scope, latest.path, latest.text)) {
        set((state) => {
          const current = (state.openDocuments[sessionId] ?? []).find((item) => item.documentId === document.documentId);
          if (!current) return state;
          const updatedDocument = { ...current, error: "Recovery draft could not be saved." };
          return {
            openDocuments: { ...state.openDocuments, [sessionId]: (state.openDocuments[sessionId] ?? []).map((item) => item.documentId === document.documentId ? updatedDocument : item) },
            documents: state.activeDocumentIds[sessionId] === document.documentId ? { ...state.documents, [sessionId]: updatedDocument } : state.documents,
          };
        });
      }
    }, 250));
  },

  saveDocument: (sessionId, documentId) => {
    const initial = documentId
      ? (get().openDocuments[sessionId] ?? []).find((item) => item.documentId === documentId) ?? null
      : get().documents[sessionId];
    if (!initial) return Promise.resolve();
    const selectedId = initial.documentId;
    const saveKey = `${sessionId}:${selectedId}`;
    const active = activeSaves.get(saveKey);
    if (active) return active;

    const save = (async () => {
      set((state) => {
        const current = (state.openDocuments[sessionId] ?? []).find((item) => item.documentId === selectedId);
        if (!current) return state;
        const updated = { ...current, saving: true, error: null };
        return {
          openDocuments: { ...state.openDocuments, [sessionId]: (state.openDocuments[sessionId] ?? []).map((item) => item.documentId === selectedId ? updated : item) },
          documents: state.activeDocumentIds[sessionId] === selectedId ? { ...state.documents, [sessionId]: updated } : state.documents,
        };
      });
      try {
        while (true) {
          const current = (get().openDocuments[sessionId] ?? []).find((item) => item.documentId === selectedId);
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
            const latest = (state.openDocuments[sessionId] ?? []).find((item) => item.documentId === selectedId);
            if (!latest) return state;
            const updated = { ...latest, savedText, error: null };
            return {
              openDocuments: { ...state.openDocuments, [sessionId]: (state.openDocuments[sessionId] ?? []).map((item) => item.documentId === selectedId ? updated : item) },
              documents: state.activeDocumentIds[sessionId] === selectedId ? { ...state.documents, [sessionId]: updated } : state.documents,
            };
          });
        }
        set((state) => {
          const current = (state.openDocuments[sessionId] ?? []).find((item) => item.documentId === selectedId);
          if (!current) return state;
          const updated = { ...current, saving: false };
          return {
            openDocuments: { ...state.openDocuments, [sessionId]: (state.openDocuments[sessionId] ?? []).map((item) => item.documentId === selectedId ? updated : item) },
            documents: state.activeDocumentIds[sessionId] === selectedId ? { ...state.documents, [sessionId]: updated } : state.documents,
          };
        });
        const latest = (get().openDocuments[sessionId] ?? []).find((item) => item.documentId === selectedId);
        if (latest && latest.recoveryText === null && latest.text === latest.savedText) {
          const scope = recoveryScope(latest.target, latest.hostKey);
          const timerKey = recoveryTimerKey(scope, latest.path);
          const timer = recoveryTimers.get(timerKey);
          if (timer) clearTimeout(timer);
          recoveryTimers.delete(timerKey);
          removeMarkWiselyDraft(localStorage, scope, latest.path);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set((state) => {
          const current = (state.openDocuments[sessionId] ?? []).find((item) => item.documentId === selectedId);
          if (!current) return state;
          const updated = { ...current, saving: false, error: message };
          return {
            openDocuments: { ...state.openDocuments, [sessionId]: (state.openDocuments[sessionId] ?? []).map((item) => item.documentId === selectedId ? updated : item) },
            documents: state.activeDocumentIds[sessionId] === selectedId ? { ...state.documents, [sessionId]: updated } : state.documents,
          };
        });
        throw error;
      }
    })();
    activeSaves.set(saveKey, save);
    void save.finally(() => {
      if (activeSaves.get(saveKey) === save) activeSaves.delete(saveKey);
    }).catch(() => undefined);
    return save;
  },

  closeDocument: async (sessionId, documentId) => {
    const documents = get().openDocuments[sessionId] ?? [];
    const closing = documentId
      ? documents.filter((document) => document.documentId === documentId)
      : documents;
    for (const document of closing) {
      if (document.target.kind === "ssh") {
        await invoke("preview_close", { request: { handle_id: document.handleId } }).catch(() => undefined);
      }
    }
    set((state) => {
      const remaining = (state.openDocuments[sessionId] ?? []).filter((document) =>
        documentId ? document.documentId !== documentId : false,
      );
      const activeId = state.activeDocumentIds[sessionId];
      const nextActive = remaining.find((document) => document.documentId === activeId) ?? remaining[remaining.length - 1] ?? null;
      return {
        openDocuments: { ...state.openDocuments, [sessionId]: remaining },
        activeDocumentIds: { ...state.activeDocumentIds, [sessionId]: nextActive?.documentId ?? null },
        documents: { ...state.documents, [sessionId]: nextActive },
      };
    });
  },

  getDocument: (sessionId) => get().documents[sessionId] ?? null,
  getDocuments: (sessionId) => get().openDocuments[sessionId] ?? [],
  activateDocument: (sessionId, documentId) => {
    const document = (get().openDocuments[sessionId] ?? []).find((item) => item.documentId === documentId);
    if (!document) return;
    set((state) => ({
      activeDocumentIds: { ...state.activeDocumentIds, [sessionId]: documentId },
      documents: { ...state.documents, [sessionId]: document },
    }));
  },
  restoreDraft: (sessionId, documentId) => {
    const document = (get().openDocuments[sessionId] ?? []).find((item) => item.documentId === documentId);
    if (!document?.recoveryText) return;
    get().setEditorValue(sessionId, document.recoveryText, documentId);
    set((state) => ({
      openDocuments: {
        ...state.openDocuments,
        [sessionId]: (state.openDocuments[sessionId] ?? []).map((item) =>
          item.documentId === documentId ? { ...item, recoveryText: null } : item,
        ),
      },
      documents: state.activeDocumentIds[sessionId] === documentId && state.documents[sessionId]
        ? { ...state.documents, [sessionId]: { ...state.documents[sessionId]!, recoveryText: null } }
        : state.documents,
    }));
  },
  discardDraft: (sessionId, documentId) => {
    const document = (get().openDocuments[sessionId] ?? []).find((item) => item.documentId === documentId);
    if (!document) return;
    const scope = recoveryScope(document.target, document.hostKey);
    const key = recoveryTimerKey(scope, document.path);
    const timer = recoveryTimers.get(key);
    if (timer) clearTimeout(timer);
    recoveryTimers.delete(key);
    removeMarkWiselyDraft(localStorage, scope, document.path);
    set((state) => {
      const updated = { ...document, recoveryText: null };
      return {
        openDocuments: { ...state.openDocuments, [sessionId]: (state.openDocuments[sessionId] ?? []).map((item) => item.documentId === documentId ? updated : item) },
        documents: state.activeDocumentIds[sessionId] === documentId ? { ...state.documents, [sessionId]: updated } : state.documents,
      };
    });
  },
  getRecentFiles: (hostKey) => get().recentFiles[hostKey] ?? [],
}));

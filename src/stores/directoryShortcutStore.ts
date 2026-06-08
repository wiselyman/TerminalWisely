import { create } from "zustand";
import type { DirectoryShortcut, DirectoryShortcutScope, SessionKind } from "../types";

const STORAGE_KEY = "terminal-wisely.directory-shortcuts";

function createShortcutId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `shortcut-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function migrateScope(value: unknown): DirectoryShortcutScope {
  if (value === "server") return "server";
  // legacy: all / ssh → 全部服务器; local → 当前本机
  if (value === "local") return "server";
  return "all";
}

function persistShortcuts(shortcuts: DirectoryShortcut[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
}

function loadShortcuts(): DirectoryShortcut[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const shortcuts = parsed
      .map((item): DirectoryShortcut | null => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const path =
          typeof record.path === "string" ? record.path.trim() : "";
        if (!path) return null;

        const legacyScope = record.scope;
        const scope = migrateScope(legacyScope);
        let server_id =
          typeof record.server_id === "string" ? record.server_id : null;
        if (scope === "server" && !server_id && legacyScope === "local") {
          server_id = "local";
        }

        return {
          id:
            typeof record.id === "string" && record.id
              ? record.id
              : createShortcutId(),
          path,
          scope,
          server_id: scope === "server" ? server_id : null,
        };
      })
      .filter((item): item is DirectoryShortcut => item !== null);

    if (shortcuts.length > 0) {
      persistShortcuts(shortcuts);
    }
    return shortcuts;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

export function isShortcutVisibleOnTab(
  shortcut: DirectoryShortcut,
  tabKind: SessionKind,
  serverId: string,
): boolean {
  if (shortcut.scope === "all") {
    if (shortcut.server_id === "local") {
      return tabKind === "local";
    }
    return tabKind === "ssh";
  }
  return shortcut.server_id === serverId;
}

interface DirectoryShortcutState {
  shortcuts: DirectoryShortcut[];
  addShortcut: (
    path: string,
    scope: DirectoryShortcutScope,
    serverId: string,
  ) => void;
  removeShortcut: (id: string) => void;
  updateShortcut: (
    id: string,
    path: string,
    scope: DirectoryShortcutScope,
    serverId: string,
  ) => void;
}

export const useDirectoryShortcutStore = create<DirectoryShortcutState>(
  (set) => ({
    shortcuts: loadShortcuts(),

    addShortcut: (path, scope, serverId) => {
      const trimmedPath = path.trim();
      if (!trimmedPath) return;

      const entry: DirectoryShortcut = {
        id: createShortcutId(),
        path: trimmedPath,
        scope,
        server_id: scope === "server" ? serverId : null,
      };

      set((state) => {
        const shortcuts = [...state.shortcuts, entry];
        persistShortcuts(shortcuts);
        return { shortcuts };
      });
    },

    removeShortcut: (id) => {
      set((state) => {
        const shortcuts = state.shortcuts.filter((item) => item.id !== id);
        persistShortcuts(shortcuts);
        return { shortcuts };
      });
    },

    updateShortcut: (id, path, scope, serverId) => {
      const trimmedPath = path.trim();
      if (!trimmedPath) return;

      set((state) => {
        const shortcuts = state.shortcuts.map((item) =>
          item.id === id
            ? {
                ...item,
                path: trimmedPath,
                scope,
                server_id: scope === "server" ? serverId : null,
              }
            : item,
        );
        persistShortcuts(shortcuts);
        return { shortcuts };
      });
    },
  }),
);

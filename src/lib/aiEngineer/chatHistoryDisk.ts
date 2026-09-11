/** Disk-backed AI chat history via Tauri SQLite (no WebView localStorage quota). */

import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../isTauri";

export const CHAT_HISTORY_KEY_V1 = "tw.aiEngineer.chatByScope.v1";
export const CHAT_HISTORY_KEY_V2 = "tw.aiEngineer.chatByScope.v2";

export type DiskChatThread = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  securityMode?: string;
  interactionMode?: string;
  messages: unknown[];
  lastRunId?: string | null;
};

export type DiskScopeBundle = {
  activeThreadId: string;
  threads: DiskChatThread[];
};

export type ChatHistorySnapshot = {
  byScope: Record<string, DiskScopeBundle>;
  migratedFromLocalstorage: boolean;
};

function readLocalStorageV2(): Record<string, DiskScopeBundle> | null {
  try {
    const rawV2 = localStorage.getItem(CHAT_HISTORY_KEY_V2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, DiskScopeBundle>;
      }
    }
    const rawV1 = localStorage.getItem(CHAT_HISTORY_KEY_V1);
    if (!rawV1) return null;
    const parsed = JSON.parse(rawV1) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const out: Record<string, DiskScopeBundle> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(v)) continue;
      const id = `t_mig_${k.slice(0, 24)}`;
      out[k] = {
        activeThreadId: id,
        threads: [
          {
            id,
            title: "Chat 1",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            securityMode: "safe",
            interactionMode: "agent",
            messages: v,
          },
        ],
      };
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

function clearLocalStorageChatKeys() {
  try {
    localStorage.removeItem(CHAT_HISTORY_KEY_V1);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(CHAT_HISTORY_KEY_V2);
  } catch {
    /* ignore */
  }
}

export async function loadChatHistoryFromDisk(): Promise<ChatHistorySnapshot> {
  if (!isTauriRuntime()) {
    const local = readLocalStorageV2() ?? {};
    return { byScope: local, migratedFromLocalstorage: true };
  }
  const raw = await invoke<Record<string, unknown>>("ai_chat_history_load");
  return normalizeChatHistorySnapshot(raw);
}

export async function loadChatScopeFromDisk(
  scope: string,
): Promise<DiskScopeBundle | null> {
  if (!isTauriRuntime()) {
    const local = readLocalStorageV2() ?? {};
    return local[scope] ?? null;
  }
  const raw = await invoke<unknown>("ai_chat_history_load_scope", { scope });
  if (!raw || typeof raw !== "object") return null;
  return normalizeScopeBundle(raw as Record<string, unknown>);
}

export function normalizeScopeBundle(raw: Record<string, unknown>): DiskScopeBundle {
  const activeThreadId = String(
    raw.activeThreadId ?? raw.active_thread_id ?? "",
  );
  const threadsRaw = raw.threads;
  const threads = Array.isArray(threadsRaw)
    ? threadsRaw.map((item) => {
        const t = (item && typeof item === "object" ? item : {}) as Record<
          string,
          unknown
        >;
        let messages = t.messages;
        if (typeof messages === "string") {
          try {
            messages = JSON.parse(messages);
          } catch {
            messages = [];
          }
        }
        if (!Array.isArray(messages)) messages = [];
        return {
          id: String(t.id ?? ""),
          title: String(t.title ?? "New chat"),
          createdAt: Number(t.createdAt ?? t.created_at ?? Date.now()),
          updatedAt: Number(t.updatedAt ?? t.updated_at ?? Date.now()),
          securityMode: String(t.securityMode ?? t.security_mode ?? "safe"),
          interactionMode: String(
            t.interactionMode ?? t.interaction_mode ?? "agent",
          ),
          messages: messages as unknown[],
          lastRunId:
            typeof t.lastRunId === "string"
              ? t.lastRunId
              : typeof t.last_run_id === "string"
                ? t.last_run_id
                : null,
        } satisfies DiskChatThread;
      })
    : [];
  return { activeThreadId, threads };
}

export function normalizeChatHistorySnapshot(
  raw: Record<string, unknown>,
): ChatHistorySnapshot {
  const byRaw =
    (raw.byScope as Record<string, unknown> | undefined) ??
    (raw.by_scope as Record<string, unknown> | undefined) ??
    {};
  const byScope: Record<string, DiskScopeBundle> = {};
  for (const [k, v] of Object.entries(byRaw)) {
    if (v && typeof v === "object") {
      byScope[k] = normalizeScopeBundle(v as Record<string, unknown>);
    }
  }
  const migrated = Boolean(
    raw.migratedFromLocalstorage ?? raw.migrated_from_localstorage,
  );
  return { byScope, migratedFromLocalstorage: migrated };
}

export async function saveScopeBundleToDisk(
  scope: string,
  bundle: DiskScopeBundle,
): Promise<void> {
  if (!isTauriRuntime()) {
    // Browser/dev fallback: best-effort localStorage for non-Tauri tests.
    try {
      const cur = readLocalStorageV2() ?? {};
      cur[scope] = bundle;
      localStorage.setItem(CHAT_HISTORY_KEY_V2, JSON.stringify(cur));
    } catch {
      /* quota */
    }
    return;
  }
  await invoke("ai_chat_history_save_scope", { scope, bundle });
}

export async function saveAllScopesToDisk(
  byScope: Record<string, DiskScopeBundle>,
): Promise<void> {
  if (!isTauriRuntime()) {
    try {
      localStorage.setItem(CHAT_HISTORY_KEY_V2, JSON.stringify(byScope));
    } catch {
      /* quota */
    }
    return;
  }
  await invoke("ai_chat_history_save_all", { byScope });
}

/**
 * Load disk DB; if not yet migrated, import localStorage v1/v2 then clear keys.
 */
export async function hydrateChatHistoryWithMigration(): Promise<ChatHistorySnapshot> {
  if (!isTauriRuntime()) {
    const local = readLocalStorageV2() ?? {};
    return { byScope: local, migratedFromLocalstorage: true };
  }

  let snap = await loadChatHistoryFromDisk();
  if (snap.migratedFromLocalstorage) {
    clearLocalStorageChatKeys();
    return snap;
  }

  const legacy = readLocalStorageV2();
  if (legacy && Object.keys(legacy).length > 0) {
    snap = await invoke<ChatHistorySnapshot>("ai_chat_history_import_localstorage", {
      byScope: legacy,
      force: false,
    });
    clearLocalStorageChatKeys();
    return snap;
  }

  await invoke("ai_chat_history_mark_migrated");
  clearLocalStorageChatKeys();
  return { ...snap, migratedFromLocalstorage: true };
}

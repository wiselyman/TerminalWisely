/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../isTauri", () => ({
  isTauriRuntime: () => false,
}));

import {
  CHAT_HISTORY_KEY_V1,
  CHAT_HISTORY_KEY_V2,
  hydrateChatHistoryWithMigration,
  normalizeChatHistorySnapshot,
  normalizeScopeBundle,
  saveScopeBundleToDisk,
} from "./chatHistoryDisk";

describe("chatHistoryDisk (browser fallback)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("hydrates from v2 localStorage", async () => {
    localStorage.setItem(
      CHAT_HISTORY_KEY_V2,
      JSON.stringify({
        "server:a@b:22": {
          activeThreadId: "t1",
          threads: [
            {
              id: "t1",
              title: "hi",
              createdAt: 1,
              updatedAt: 2,
              securityMode: "safe",
              interactionMode: "agent",
              messages: [{ id: "m1", kind: "user", content: "hello" }],
            },
          ],
        },
      }),
    );
    const snap = await hydrateChatHistoryWithMigration();
    expect(snap.migratedFromLocalstorage).toBe(true);
    expect(Object.keys(snap.byScope)).toEqual(["server:a@b:22"]);
    expect(snap.byScope["server:a@b:22"].threads[0].title).toBe("hi");
  });

  it("saves a scope bundle back to localStorage in non-Tauri", async () => {
    await saveScopeBundleToDisk("server:x@y:22", {
      activeThreadId: "t9",
      threads: [
        {
          id: "t9",
          title: "n",
          createdAt: 1,
          updatedAt: 1,
          messages: [],
        },
      ],
    });
    const raw = localStorage.getItem(CHAT_HISTORY_KEY_V2);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed["server:x@y:22"].activeThreadId).toBe("t9");
    expect(localStorage.getItem(CHAT_HISTORY_KEY_V1)).toBeNull();
  });

  it("normalizes snake_case IPC and stringified messages", () => {
    const bundle = normalizeScopeBundle({
      active_thread_id: "t1",
      threads: [
        {
          id: "t1",
          title: "x",
          created_at: 10,
          updated_at: 20,
          security_mode: "safe",
          interaction_mode: "agent",
          messages: JSON.stringify([{ id: "m1", kind: "user", content: "hi" }]),
          last_run_id: "run-1",
        },
      ],
    });
    expect(bundle.activeThreadId).toBe("t1");
    expect(bundle.threads[0].messages).toEqual([
      { id: "m1", kind: "user", content: "hi" },
    ]);
    expect(bundle.threads[0].lastRunId).toBe("run-1");

    const snap = normalizeChatHistorySnapshot({
      by_scope: { "server:a@b:22": bundle },
      migrated_from_localstorage: true,
    });
    expect(snap.migratedFromLocalstorage).toBe(true);
    expect(snap.byScope["server:a@b:22"].activeThreadId).toBe("t1");
  });
});

import { describe, expect, it } from "vitest";
import {
  isOrphanPendingScope,
  pruneForQuota,
  pruneOrphanPendingScopes,
  sanitizeScopeBundle,
} from "./chatHistoryPersist";

describe("sanitizeScopeBundle", () => {
  it("drops empty New chat when real threads exist and activates newest with messages", () => {
    const next = sanitizeScopeBundle({
      activeThreadId: "empty",
      threads: [
        { id: "empty", title: "New chat", updatedAt: 99, messages: [] },
        {
          id: "real",
          title: "xrdp",
          updatedAt: 50,
          messages: [{ kind: "user", content: "hi" }],
        },
        {
          id: "older",
          title: "old",
          updatedAt: 10,
          messages: [{ kind: "user", content: "yo" }],
        },
      ],
    });
    expect(next.threads.map((t) => t.id).sort()).toEqual(["older", "real"]);
    expect(next.activeThreadId).toBe("real");
  });

  it("keeps sole empty thread", () => {
    const next = sanitizeScopeBundle({
      activeThreadId: "t1",
      threads: [{ id: "t1", messages: [], updatedAt: 1 }],
    });
    expect(next.threads).toHaveLength(1);
    expect(next.activeThreadId).toBe("t1");
  });
});

describe("pruneOrphanPendingScopes", () => {
  it("drops empty pending scopes and keeps host scopes", () => {
    const next = pruneOrphanPendingScopes({
      "server:pending:abc": {
        activeThreadId: "t1",
        threads: [{ id: "t1", messages: [], updatedAt: 1 }],
      },
      "server:wiselyman@1.2.3.4:22": {
        activeThreadId: "t2",
        threads: [
          { id: "t2", messages: [{ kind: "user", content: "hi" }], updatedAt: 2 },
        ],
      },
    });
    expect(Object.keys(next)).toEqual(["server:wiselyman@1.2.3.4:22"]);
  });

  it("keeps pending scope that has messages", () => {
    expect(
      isOrphanPendingScope("server:pending:x", {
        activeThreadId: "t",
        threads: [{ id: "t", messages: [{ kind: "user" }], updatedAt: 1 }],
      }),
    ).toBe(false);
  });
});

describe("pruneForQuota", () => {
  it("caps scope count while keeping preferred scopes", () => {
    const by: Record<
      string,
      { activeThreadId: string; threads: Array<{ id: string; updatedAt: number; messages: unknown[] }> }
    > = {};
    for (let i = 0; i < 10; i += 1) {
      by[`server:h${i}`] = {
        activeThreadId: `t${i}`,
        threads: [
          {
            id: `t${i}`,
            updatedAt: i,
            messages: i === 9 ? [{ kind: "user" }] : [],
          },
        ],
      };
    }
    const next = pruneForQuota(by, ["server:h9"], 3);
    expect(Object.keys(next).length).toBeLessThanOrEqual(3);
    expect(next["server:h9"]).toBeTruthy();
  });
});

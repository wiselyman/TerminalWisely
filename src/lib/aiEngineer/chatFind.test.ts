import { describe, expect, it } from "vitest";
import { findChatMatches, stepMatchIndex } from "./chatFind";

describe("findChatMatches", () => {
  const lines = [
    { id: "u1", kind: "user", content: "check firewall rules" },
    { id: "a1", kind: "assistant", content: "Looking at ufw status" },
    { id: "n1", kind: "notice", content: "compaction" },
    { id: "a2", kind: "assistant", content: "", streaming: true },
  ];

  it("matches user and assistant text case-insensitively", () => {
    const hits = findChatMatches(lines, "FIREWALL");
    expect(hits).toEqual([{ lineId: "u1", index: 0 }]);
  });

  it("skips empty streaming assistant stubs", () => {
    expect(findChatMatches(lines, "Looking")).toEqual([
      { lineId: "a1", index: 1 },
    ]);
  });

  it("returns empty for blank query", () => {
    expect(findChatMatches(lines, "  ")).toEqual([]);
  });
});

describe("stepMatchIndex", () => {
  it("wraps around", () => {
    expect(stepMatchIndex(0, 3, 1)).toBe(1);
    expect(stepMatchIndex(2, 3, 1)).toBe(0);
    expect(stepMatchIndex(0, 3, -1)).toBe(2);
  });
});

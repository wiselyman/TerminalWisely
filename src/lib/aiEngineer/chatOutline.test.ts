import { describe, expect, it } from "vitest";
import { buildChatOutline, stepOutlineIndex } from "./chatOutline";

describe("buildChatOutline", () => {
  it("numbers user and assistant nodes with previews", () => {
    const nodes = buildChatOutline([
      { id: "u1", kind: "user", content: "hello world from long message here" },
      { id: "a1", kind: "assistant", content: "hi there" },
      { id: "t1", kind: "tool", content: "ignored" },
      { id: "a2", kind: "assistant", content: "", streaming: true },
    ]);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ id: "u1", kind: "user", ordinal: 1 });
    expect(nodes[1]).toMatchObject({ id: "a1", kind: "assistant", ordinal: 1 });
  });
});

describe("stepOutlineIndex", () => {
  const nodes = buildChatOutline([
    { id: "u1", kind: "user", content: "a" },
    { id: "a1", kind: "assistant", content: "b" },
    { id: "u2", kind: "user", content: "c" },
  ]);

  it("steps to next and wraps", () => {
    expect(stepOutlineIndex(nodes, "u1", 1)).toBe("a1");
    expect(stepOutlineIndex(nodes, "u2", 1)).toBe("u1");
    expect(stepOutlineIndex(nodes, null, -1)).toBe("u2");
  });
});

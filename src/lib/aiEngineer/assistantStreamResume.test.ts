import { describe, expect, it } from "vitest";
import {
  applyAssistantDeltaToMessages,
  findLastAssistantIndexInTurn,
  isTruncatedAnswerNotice,
} from "./assistantStreamResume";

describe("findLastAssistantIndexInTurn", () => {
  it("skips trailing harness notices", () => {
    const msgs = [
      { kind: "user", content: "q" },
      { kind: "assistant", content: "| a | b |" },
      { kind: "notice", content: "act_nudge_truncated_answer" },
    ];
    expect(findLastAssistantIndexInTurn(msgs)).toBe(1);
  });
});

describe("applyAssistantDeltaToMessages", () => {
  it("resumes into the prior bubble and drops trunc notices", () => {
    const msgs = [
      { id: "u", kind: "user", content: "q" },
      {
        id: "a",
        kind: "assistant",
        content: "| size | path |\n| --- | --- |\n| 101M | /a |",
        streaming: false,
      },
      {
        id: "n",
        kind: "notice",
        content: "act_nudge_truncated_answer",
      },
    ];
    const next = applyAssistantDeltaToMessages(msgs, "\n| 102M | /b |", {
      looksTruncated: () => true,
      merge: (p, n) => p + n,
      newId: () => "x",
    });
    expect(next).toHaveLength(2);
    expect(next[1].kind).toBe("assistant");
    expect(next[1].content).toContain("| 102M | /b |");
    expect(next[1].content).toContain("| 101M | /a |");
    expect(next.some(isTruncatedAnswerNotice)).toBe(false);
  });

  it("starts a new bubble after tool cards instead of hiding the answer above them", () => {
    const msgs = [
      { id: "u", kind: "user", content: "q" },
      {
        id: "a",
        kind: "assistant",
        content: "还没修好。让我找到 Merge.yaml 的真实位置：",
        streaming: false,
      },
      { id: "t", kind: "tool", content: "cat Merge.yaml" },
    ];
    const next = applyAssistantDeltaToMessages(msgs, "没修好。需要重载。", {
      looksTruncated: () => true,
      merge: (p, n) => p + n,
      newId: () => "final",
    });
    expect(next.map((m) => m.kind)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(next[1].content).toBe("还没修好。让我找到 Merge.yaml 的真实位置：");
    expect(next[3].id).toBe("final");
    expect(next[3].content).toBe("没修好。需要重载。");
  });

  it("does not open a second assistant bubble after trunc notice", () => {
    const msgs = [
      { id: "u", kind: "user", content: "q" },
      { id: "a", kind: "assistant", content: "| 101M | /a |", streaming: true },
      { id: "n", kind: "notice", content: "act_nudge_truncated_answer" },
    ];
    const next = applyAssistantDeltaToMessages(msgs, "\n| 102M | /b |", {
      looksTruncated: () => false,
      merge: (p, n) => p + n,
      newId: () => "new",
    });
    expect(next.filter((m) => m.kind === "assistant")).toHaveLength(1);
    expect(next[1].id).toBe("a");
  });
});

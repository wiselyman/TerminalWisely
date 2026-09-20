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

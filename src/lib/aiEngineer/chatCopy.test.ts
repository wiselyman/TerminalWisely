import { describe, expect, it } from "vitest";
import {
  copyableChatText,
  isAssistantReplyCopyAnchor,
  shouldShowChatCopy,
  wholeAssistantReplyText,
} from "./chatCopy";

describe("chatCopy", () => {
  it("trims and rejects empty", () => {
    expect(copyableChatText("  hello  ")).toBe("hello");
    expect(shouldShowChatCopy("   ")).toBe(false);
    expect(shouldShowChatCopy("hi")).toBe(true);
  });

  it("joins whole assistant reply for the user turn", () => {
    const lines = [
      { kind: "user", content: "测 tok/s" },
      { kind: "tool", content: "curl …" },
      { kind: "assistant", content: "先查服务。" },
      { kind: "notice", content: "evidence_nudge" },
      { kind: "assistant", content: "eval_count=425\n约 125 tok/s" },
      { kind: "user", content: "下一问" },
      { kind: "assistant", content: "别的答案" },
    ];
    expect(wholeAssistantReplyText(lines, 2)).toBe(
      "先查服务。\n\neval_count=425\n约 125 tok/s",
    );
    expect(wholeAssistantReplyText(lines, 4)).toBe(
      "先查服务。\n\neval_count=425\n约 125 tok/s",
    );
    expect(wholeAssistantReplyText(lines, 6)).toBe("别的答案");
  });

  it("skips duplicate consecutive assistant text", () => {
    const lines = [
      { kind: "user", content: "q" },
      { kind: "assistant", content: "same" },
      { kind: "assistant", content: "same" },
    ];
    expect(wholeAssistantReplyText(lines, 1)).toBe("same");
  });

  it("anchors copy only on finished last assistant of the turn", () => {
    const lines = [
      { kind: "user", content: "q" },
      { kind: "assistant", content: "part1" },
      { kind: "tool", content: "x" },
      { kind: "assistant", content: "part2 final" },
    ];
    expect(isAssistantReplyCopyAnchor(lines, 1)).toBe(false);
    expect(isAssistantReplyCopyAnchor(lines, 3)).toBe(true);

    const streaming = [
      { kind: "user", content: "q" },
      { kind: "assistant", content: "draft", streaming: true },
    ];
    expect(isAssistantReplyCopyAnchor(streaming, 1)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  harnessNudgeContentCode,
  retractProvisionalAssistant,
  withToolEvidenceFlags,
} from "./harnessNotices";

describe("harnessNudgeContentCode", () => {
  it("maps evidence blocked vs soft nudge", () => {
    expect(harnessNudgeContentCode("evidence_nudge")).toBe("evidence_nudge");
    expect(harnessNudgeContentCode("evidence_nudge", { blocked: true })).toBe(
      "evidence_nudge_blocked",
    );
  });

  it("maps act kinds", () => {
    expect(harnessNudgeContentCode("act_nudge", { kind: "act" })).toBe("act_nudge");
    expect(harnessNudgeContentCode("act_nudge", { kind: "conclude" })).toBe(
      "act_nudge_conclude",
    );
    expect(harnessNudgeContentCode("act_nudge", { kind: "idle_plan" })).toBe(
      "act_nudge_plan",
    );
    expect(
      harnessNudgeContentCode("act_nudge", { kind: "truncated_answer" }),
    ).toBe("act_nudge_truncated_answer");
  });

  it("maps audit nudge", () => {
    expect(harnessNudgeContentCode("audit_nudge")).toBe("audit_nudge");
  });
});

describe("retractProvisionalAssistant", () => {
  it("drops all assistants after latest user", () => {
    const out = retractProvisionalAssistant([
      { id: "1", kind: "user", content: "q" },
      { id: "2", kind: "assistant", content: "first fake", streaming: true },
      { id: "3", kind: "notice", content: "audit_nudge" },
      { id: "4", kind: "assistant", content: "second fake" },
    ]);
    expect(out.map((m) => m.id)).toEqual(["1", "3"]);
  });

  it("keeps tools after user while dropping assistants", () => {
    const out = retractProvisionalAssistant([
      { id: "1", kind: "user", content: "q" },
      { id: "2", kind: "tool" },
      { id: "3", kind: "assistant", content: "fake" },
    ]);
    expect(out.map((m) => m.id)).toEqual(["1", "2"]);
  });

  it("no-ops when no assistant after user", () => {
    const msgs = [
      { id: "1", kind: "user", content: "q" },
      { id: "2", kind: "notice", content: "x" },
    ];
    expect(retractProvisionalAssistant(msgs)).toEqual(msgs);
  });
});

describe("withToolEvidenceFlags", () => {
  it("marks last assistant as evidenced when tools ran after latest user", () => {
    const out = withToolEvidenceFlags([
      { id: "1", kind: "user" },
      { id: "2", kind: "tool" },
      { id: "3", kind: "assistant" },
    ]);
    expect(out[2].toolEvidence).toBe(true);
  });

  it("marks last assistant as not evidenced when no tools", () => {
    const out = withToolEvidenceFlags([
      { id: "1", kind: "user" },
      { id: "2", kind: "assistant" },
    ]);
    expect(out[1].toolEvidence).toBe(false);
  });

  it("ignores tools from prior user turns", () => {
    const out = withToolEvidenceFlags([
      { id: "1", kind: "user" },
      { id: "2", kind: "tool" },
      { id: "3", kind: "assistant" },
      { id: "4", kind: "user" },
      { id: "5", kind: "assistant" },
    ]);
    expect(out[4].toolEvidence).toBe(false);
    expect(out[2].toolEvidence).toBeUndefined();
  });
});

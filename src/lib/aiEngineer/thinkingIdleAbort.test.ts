import { describe, expect, it } from "vitest";
import {
  chatHasRunningTool,
  shouldAbortThinkingIdle,
} from "./thinkingIdleAbort";

describe("shouldAbortThinkingIdle", () => {
  const base = {
    busy: true,
    idleMs: 6 * 60_000,
    thresholdMs: 5 * 60_000,
    pendingApproval: false,
    pendingAsk: false,
    hasRunningTool: false,
  };

  it("aborts when busy and idle past threshold with no host wait", () => {
    expect(shouldAbortThinkingIdle(base)).toBe(true);
  });

  it("does not abort while a tool is still running (large download)", () => {
    expect(
      shouldAbortThinkingIdle({ ...base, hasRunningTool: true }),
    ).toBe(false);
  });

  it("does not abort while approval or ask is pending", () => {
    expect(
      shouldAbortThinkingIdle({ ...base, pendingApproval: true }),
    ).toBe(false);
    expect(shouldAbortThinkingIdle({ ...base, pendingAsk: true })).toBe(false);
  });

  it("does not abort when not busy or still within threshold", () => {
    expect(shouldAbortThinkingIdle({ ...base, busy: false })).toBe(false);
    expect(
      shouldAbortThinkingIdle({ ...base, idleMs: 60_000 }),
    ).toBe(false);
  });

  it("detects running tool lines", () => {
    expect(
      chatHasRunningTool([
        { kind: "assistant" },
        { kind: "tool", status: "running" },
      ]),
    ).toBe(true);
    expect(
      chatHasRunningTool([{ kind: "tool", status: "done" }]),
    ).toBe(false);
  });
});

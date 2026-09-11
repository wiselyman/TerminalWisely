import { describe, expect, it } from "vitest";
import {
  buildOptimisticToolAfterApproval,
  isAwaitingApprovedExecStuck,
} from "./approvalOptimisticExec";
import { isAwaitingApprovedExec } from "./runBusyPhase";

describe("buildOptimisticToolAfterApproval", () => {
  it("returns null without callId", () => {
    expect(
      buildOptimisticToolAfterApproval({
        command: "rm -rf /tmp/x",
      }),
    ).toBeNull();
  });

  it("prefers execCommand and marks running", () => {
    const line = buildOptimisticToolAfterApproval(
      {
        callId: "c1",
        command: "ip link set eth0 down",
        execCommand: "wrapped-script",
        intent: "network change",
      },
      { now: 1000 },
    );
    expect(line).toEqual({
      kind: "tool",
      name: "terminal_exec",
      callId: "c1",
      intent: "network change",
      detail: "wrapped-script",
      status: "running",
      startedAt: 1000,
    });
  });

  it("clears awaitingApprovedExec once optimistic tool exists", () => {
    expect(
      isAwaitingApprovedExec([
        { kind: "approval", decision: "approved" },
        {
          kind: "tool",
          name: "terminal_exec",
          status: "running",
        },
      ]),
    ).toBe(false);
  });
});

describe("isAwaitingApprovedExecStuck", () => {
  it("false before threshold", () => {
    expect(isAwaitingApprovedExecStuck(1000, 5000, { thresholdMs: 12_000 })).toBe(
      false,
    );
  });
  it("true after threshold", () => {
    expect(isAwaitingApprovedExecStuck(1000, 14_000, { thresholdMs: 12_000 })).toBe(
      true,
    );
  });
});

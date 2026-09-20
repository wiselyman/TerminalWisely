import { describe, expect, it } from "vitest";
import {
  approvalBadgeForTool,
  shouldCollapseExecCommand,
  shouldOmitResolvedApprovalCard,
} from "./approvalCommandDedupe";

describe("shouldOmitResolvedApprovalCard", () => {
  it("omits when approved and a tool line shares callId", () => {
    expect(
      shouldOmitResolvedApprovalCard(
        { kind: "approval", callId: "c1", decision: "approved" },
        [
          { kind: "approval", callId: "c1", decision: "approved" },
          { kind: "tool", callId: "c1" },
        ],
      ),
    ).toBe(true);
  });

  it("keeps pending or rejected approval cards", () => {
    expect(
      shouldOmitResolvedApprovalCard(
        { kind: "approval", callId: "c1" },
        [{ kind: "tool", callId: "c1" }],
      ),
    ).toBe(false);
    expect(
      shouldOmitResolvedApprovalCard(
        { kind: "approval", callId: "c1", decision: "rejected" },
        [{ kind: "tool", callId: "c1" }],
      ),
    ).toBe(false);
  });
});

describe("approvalBadgeForTool", () => {
  it("reads risk from tool fields or sibling approval", () => {
    expect(
      approvalBadgeForTool(
        { kind: "tool", callId: "c1", risk: "R3", approvalDecision: "approved" },
        [],
      ),
    ).toEqual({ risk: "R3", approved: true });
    expect(
      approvalBadgeForTool({ kind: "tool", callId: "c1" }, [
        { kind: "approval", callId: "c1", decision: "approved", risk: "R2" },
      ]),
    ).toEqual({ risk: "R2", approved: true });
  });
});

describe("shouldCollapseExecCommand", () => {
  it("collapses long finished commands", () => {
    const long = "find / " + "-not -path 'x' ".repeat(40);
    expect(shouldCollapseExecCommand(long)).toBe(true);
    expect(shouldCollapseExecCommand(long, { running: true })).toBe(false);
    expect(shouldCollapseExecCommand("echo ok")).toBe(false);
  });
});

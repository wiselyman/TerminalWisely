/** Approval ↔ exec card linkage: omit duplicate approved cards; carry risk onto tools. */

export type ApprovalDedupeLine = {
  kind: string;
  callId?: string;
  decision?: string;
  risk?: string;
};

export type ToolDedupeLine = {
  kind: string;
  callId?: string;
  risk?: string;
  approvalDecision?: "approved" | "rejected";
};

/** Approved card whose command already lives on a tool card — do not render the card. */
export function shouldOmitResolvedApprovalCard(
  approval: ApprovalDedupeLine,
  messages: ReadonlyArray<ToolDedupeLine | ApprovalDedupeLine>,
): boolean {
  if (approval.kind !== "approval") return false;
  if (approval.decision !== "approved") return false;
  const callId = (approval.callId || "").trim();
  if (!callId) return false;
  return messages.some(
    (m) => m.kind === "tool" && (m.callId || "").trim() === callId,
  );
}

/** @deprecated use shouldOmitResolvedApprovalCard */
export const shouldHideApprovedCommandBody = shouldOmitResolvedApprovalCard;

/** Risk / approved flags for an exec card (from tool fields or sibling approval). */
export function approvalBadgeForTool(
  tool: ToolDedupeLine,
  messages: ReadonlyArray<ToolDedupeLine | ApprovalDedupeLine>,
): { risk?: string; approved: boolean } {
  if (tool.kind !== "tool") return { approved: false };
  const callId = (tool.callId || "").trim();
  if (tool.risk || tool.approvalDecision === "approved") {
    return {
      risk: tool.risk,
      approved: tool.approvalDecision === "approved" || Boolean(tool.risk),
    };
  }
  if (!callId) return { approved: false };
  for (const m of messages) {
    if (m.kind !== "approval") continue;
    const approval = m as ApprovalDedupeLine;
    if (
      (approval.callId || "").trim() === callId &&
      approval.decision === "approved"
    ) {
      return { risk: approval.risk, approved: true };
    }
  }
  return { approved: false };
}

/** Long shell dumps: collapse the command block after the run finishes. */
export function shouldCollapseExecCommand(
  command: string,
  opts?: { running?: boolean; live?: boolean },
): boolean {
  if (opts?.running || opts?.live) return false;
  const raw = (command || "").trim();
  if (!raw) return false;
  if (raw.length >= 360) return true;
  return raw.split("\n").length >= 6;
}

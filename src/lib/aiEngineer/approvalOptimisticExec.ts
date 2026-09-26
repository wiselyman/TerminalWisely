/** Optimistic host tool card right after approval — closes the “did it start?” gap. */

export type ApprovalForOptimisticExec = {
  callId?: string;
  command: string;
  execCommand?: string;
  intent?: string;
  toolName?: string;
  risk?: string;
};

export type OptimisticToolLine = {
  kind: "tool";
  name: string;
  callId: string;
  intent?: string;
  detail: string;
  status: "running";
  startedAt: number;
  risk?: string;
  approvalDecision?: "approved";
  agentSource?: "cursor" | "codex" | "claude";
};

/** Build a provisional running tool line from an approved card (needs callId). */
export function buildOptimisticToolAfterApproval(
  approval: ApprovalForOptimisticExec,
  opts?: {
    now?: number;
    agentSource?: "cursor" | "codex" | "claude";
  },
): OptimisticToolLine | null {
  const callId = (approval.callId || "").trim();
  if (!callId) return null;
  const detail = (
    approval.execCommand?.trim() ||
    approval.command.trim() ||
    ""
  ).trim();
  if (!detail) return null;
  const risk = (approval.risk || "").trim() || undefined;
  return {
    kind: "tool",
    name: (approval.toolName || "terminal_exec").trim() || "terminal_exec",
    callId,
    intent: approval.intent?.trim() || undefined,
    detail,
    status: "running",
    startedAt: opts?.now ?? Date.now(),
    risk,
    approvalDecision: "approved",
    ...(opts?.agentSource ? { agentSource: opts.agentSource } : {}),
  };
}

/** True when awaiting_exec has lasted long enough to warn the user. */
export function isAwaitingApprovedExecStuck(
  awaitingSinceMs: number | null,
  nowMs: number,
  opts?: { thresholdMs?: number },
): boolean {
  if (awaitingSinceMs == null) return false;
  const thresholdMs = opts?.thresholdMs ?? 12_000;
  return nowMs - awaitingSinceMs >= thresholdMs;
}

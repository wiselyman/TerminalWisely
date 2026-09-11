/** Harness nudge / evidence helpers for AI Engineer chat UI. */

export type HarnessNudgeType =
  | "evidence_nudge"
  | "act_nudge"
  | "verify_nudge"
  | "audit_nudge";

export type HarnessNudgePayload = {
  kind?: string;
  blocked?: boolean;
  suppressed_chars?: number;
  risk?: string;
  reason?: string;
};

/** Stable content codes stored on notice lines (mapped via i18n in the panel). */
export function harnessNudgeContentCode(
  type: HarnessNudgeType,
  payload?: HarnessNudgePayload,
): string {
  if (type === "evidence_nudge") {
    return payload?.blocked ? "evidence_nudge_blocked" : "evidence_nudge";
  }
  if (type === "verify_nudge") {
    return "verify_nudge";
  }
  if (type === "audit_nudge") {
    return "audit_nudge";
  }
  const kind = (payload?.kind || "act").trim();
  if (kind === "conclude") return "act_nudge_conclude";
  if (kind === "truncated_plan" || kind === "idle_plan") return "act_nudge_plan";
  if (kind === "truncated_answer") return "act_nudge_truncated_answer";
  return "act_nudge";
}

export type EvidenceChatLine = {
  id: string;
  kind: string;
  toolEvidence?: boolean;
};

export type RetractableChatLine = {
  id: string;
  kind: string;
  streaming?: boolean;
  content?: string;
};

/**
 * Remove assistant bubbles after the latest user message (Stop-audit reject).
 * Keeps tools/notices; clears all ungated prose for this turn, not just the last bubble.
 */
export function retractProvisionalAssistant<T extends RetractableChatLine>(
  messages: T[],
): T[] {
  if (!messages.length) return messages;
  let lastUser = -1;
  for (let i = 0; i < messages.length; i += 1) {
    if (messages[i].kind === "user") lastUser = i;
  }
  if (lastUser < 0) {
    // No user line — drop trailing assistants only.
    return messages.filter((m) => m.kind !== "assistant");
  }
  return messages.filter((m, i) => i <= lastUser || m.kind !== "assistant");
}

/**
 * Mark the last assistant line after the latest user message with whether
 * any tool ran in that turn (for UI "取证 / 未取证" badge).
 */
export function withToolEvidenceFlags<T extends EvidenceChatLine>(
  messages: T[],
): Array<T & { toolEvidence?: boolean }> {
  let lastUser = -1;
  for (let i = 0; i < messages.length; i += 1) {
    if (messages[i].kind === "user") lastUser = i;
  }
  const start = lastUser + 1;
  let hasTool = false;
  let lastAssistant = -1;
  for (let i = start; i < messages.length; i += 1) {
    const k = messages[i].kind;
    if (k === "tool") hasTool = true;
    if (k === "assistant") lastAssistant = i;
  }
  if (lastAssistant < 0) return messages;
  return messages.map((line, i) =>
    i === lastAssistant ? { ...line, toolEvidence: hasTool } : line,
  );
}

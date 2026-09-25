/**
 * FE idle watchdog: abort a busy chat when the model stream dies.
 * Must NOT fire while a host tool / approval / ask is in flight — large
 * downloads can run for hours with sparse stdout and zero model tokens.
 */

export type ThinkingIdleAbortInput = {
  busy: boolean;
  idleMs: number;
  thresholdMs: number;
  pendingApproval: boolean;
  pendingAsk: boolean;
  /** Any tool card still status=running (host exec in progress). */
  hasRunningTool: boolean;
};

export function shouldAbortThinkingIdle(input: ThinkingIdleAbortInput): boolean {
  if (!input.busy) return false;
  if (input.pendingApproval || input.pendingAsk) return false;
  if (input.hasRunningTool) return false;
  return input.idleMs >= input.thresholdMs;
}

export function chatHasRunningTool(
  messages: ReadonlyArray<{ kind: string; status?: string }>,
): boolean {
  return messages.some(
    (line) => line.kind === "tool" && line.status === "running",
  );
}

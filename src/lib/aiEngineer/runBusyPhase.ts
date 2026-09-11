/** Derive AI Engineer bottom busy copy from run phase (not always "Thinking…"). */

export type BusyPhase =
  | { kind: "approval" }
  | { kind: "sudo" }
  | { kind: "awaiting_exec" }
  | { kind: "host_exec"; title: string }
  | { kind: "thinking"; streamingThought: boolean }
  | { kind: "idle" };

export type BusyPhaseTool = {
  kind: "tool";
  name: string;
  status?: string;
  intent?: string;
  detail?: string;
};

export type BusyPhaseInput = {
  busy: boolean;
  pendingApproval: boolean;
  /** Global sudo password modal is open (often above / easy to miss). */
  sudoPromptOpen?: boolean;
  /**
   * User approved a mutation but no host tool card is running yet
   * (stream still delivering tool_call, or lease/sudo about to start).
   */
  awaitingApprovedExec?: boolean;
  modelPhase?: "thinking" | "streaming" | string | null;
  tools: BusyPhaseTool[];
};

function isHostExecTool(name: string): boolean {
  return (
    name === "terminal_exec" ||
    name === "ai_exec" ||
    name.startsWith("k8s_")
  );
}

function toolTitle(tool: BusyPhaseTool): string {
  const intent = (tool.intent || "").trim();
  if (intent) return intent.length > 72 ? `${intent.slice(0, 72)}…` : intent;
  const detail = (tool.detail || "").trim().split("\n")[0] || tool.name;
  return detail.length > 72 ? `${detail.slice(0, 72)}…` : detail;
}

/** Pick UI phase while the run is busy. */
export function resolveBusyPhase(input: BusyPhaseInput): BusyPhase {
  if (!input.busy) return { kind: "idle" };
  if (input.pendingApproval) return { kind: "approval" };
  if (input.sudoPromptOpen) return { kind: "sudo" };

  const running = [...input.tools]
    .reverse()
    .find(
      (t) =>
        t.kind === "tool" &&
        t.status === "running" &&
        isHostExecTool(t.name),
    );
  if (running) {
    return { kind: "host_exec", title: toolTitle(running) };
  }

  if (input.awaitingApprovedExec) {
    return { kind: "awaiting_exec" };
  }

  return {
    kind: "thinking",
    streamingThought: input.modelPhase === "thinking",
  };
}

/** True when the latest approval was accepted and no later host tool started. */
export function isAwaitingApprovedExec(
  messages: Array<{
    kind: string;
    decision?: string;
    status?: string;
    name?: string;
  }>,
): boolean {
  let lastApprovalIdx = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].kind === "approval") {
      lastApprovalIdx = i;
      break;
    }
  }
  if (lastApprovalIdx < 0) return false;
  if (messages[lastApprovalIdx].decision !== "approved") return false;
  for (let i = lastApprovalIdx + 1; i < messages.length; i += 1) {
    const m = messages[i];
    if (
      m.kind === "tool" &&
      m.name &&
      isHostExecTool(m.name) &&
      (m.status === "running" ||
        m.status === "done" ||
        m.status === "failed" ||
        m.status === "cancelled" ||
        m.status === "denied")
    ) {
      return false;
    }
  }
  return true;
}

export type ExecLiveStatus =
  | "running_silent"
  | "running_live"
  | "done"
  | "failed"
  | "denied"
  | "cancelled"
  | "idle";

export function resolveExecLiveStatus(input: {
  status?: string;
  hasOutput: boolean;
}): ExecLiveStatus {
  if (input.status === "running") {
    return input.hasOutput ? "running_live" : "running_silent";
  }
  if (input.status === "done") return "done";
  if (input.status === "failed") return "failed";
  if (input.status === "denied") return "denied";
  if (input.status === "cancelled") return "cancelled";
  return "idle";
}

export function formatElapsedMs(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

/**
 * Chat footer busy line (dots + 思考中…). Host exec feedback is on the tool
 * card title; hide footer while a host tool is running. Keep showing after
 * tools finish until assistant tokens are visible — even if modelPhase is
 * still "streaming" from an earlier delta.
 */
export function shouldShowChatBusyLine(input: {
  busy: boolean;
  busyPhaseKind: BusyPhase["kind"];
  hasVisibleStreamingAssistant: boolean;
}): boolean {
  if (!input.busy) return false;
  if (input.hasVisibleStreamingAssistant) return false;
  if (input.busyPhaseKind === "host_exec") return false;
  return true;
}

/** Finalize host tool cards when a run stops or ends while tools still say running. */

export type ToolRunStatus = "running" | "done" | "failed" | "denied" | "cancelled";

export type ToolRunLine = {
  kind: "tool";
  status?: ToolRunStatus;
  output?: string;
  finishedAt?: number;
  startedAt?: number;
  lastOutputAt?: number;
};

const STOPPED_NOTE = "\n[stopped by user]";

/** Mark any still-running tool lines as cancelled so the UI stops pretending they are live. */
export function markRunningToolsStopped<T extends { kind: string }>(
  messages: T[],
  opts?: { now?: number; note?: string },
): T[] {
  const now = opts?.now ?? Date.now();
  const note = opts?.note ?? STOPPED_NOTE;
  let changed = false;
  const next = messages.map((line) => {
    if (line.kind !== "tool") return line;
    const tool = line as T & ToolRunLine;
    if (tool.status !== "running") return line;
    changed = true;
    const output = tool.output?.includes("[stopped by user]")
      ? tool.output
      : `${tool.output ?? ""}${note}`;
    return {
      ...tool,
      status: "cancelled" as const,
      finishedAt: now,
      output,
    };
  });
  return changed ? next : messages;
}

/** True when a tool card should still animate as live execution. */
export function isToolLiveRunning(status?: string): boolean {
  return status === "running";
}

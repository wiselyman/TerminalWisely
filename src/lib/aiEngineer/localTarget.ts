export const LOCAL_CHAT_SESSION = "local";

export type ExecTarget = "local" | "ssh";

/** Home uses local capture. Every other chat keeps the SSH exec command. */
export function terminalExecCommand(
  sessionId: string,
  target?: string | null,
): "ai_local_exec" | "ai_terminal_exec" {
  if (target === "local" || sessionId === LOCAL_CHAT_SESSION) return "ai_local_exec";
  return "ai_terminal_exec";
}

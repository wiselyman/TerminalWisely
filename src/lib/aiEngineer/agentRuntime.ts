/** Composer agent runtime: builtin model profiles vs local Cursor/Codex/Claude CLI. */

export type AgentRuntimeKind = "builtin" | "cursor" | "codex" | "claude";

export function normalizeAgentRuntime(value: unknown): AgentRuntimeKind {
  return value === "cursor" || value === "codex" || value === "claude"
    ? value
    : "builtin";
}

/** Stamp on ToolExecCard when a local CLI agent drove the TW MCP call. */
export function toolAgentSource(
  runtime: unknown,
): "cursor" | "codex" | "claude" | undefined {
  const r = normalizeAgentRuntime(runtime);
  return r === "builtin" ? undefined : r;
}

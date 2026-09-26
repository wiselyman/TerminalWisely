/** Map sidecar `external_tool_activity` events → compact chat card model. */

export type ExternalAgentActivityCard = {
  name: string;
  detail: string;
  ok: boolean | null;
  runtime: "cursor" | "codex" | "claude" | "external";
};

/**
 * TW MCP tools already render as normal ToolExecCard / web cards.
 * Showing a parallel "cursor.terminal_exec" activity card is redundant.
 */
export function isMirroredTwMcpActivity(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  const base = n.includes(".") ? (n.split(".").pop() ?? n) : n;
  if (
    base === "terminal_exec" ||
    base === "web_search" ||
    base === "web_fetch" ||
    base === "ask_user"
  ) {
    return true;
  }
  if (base.startsWith("k8s_")) return true;
  // Prefixed MCP ids: terminalwisely-terminal_exec, mcp.terminal_exec
  if (
    /(^|[._-])(terminal_exec|web_search|web_fetch|ask_user)($|[._-])/.test(n)
  ) {
    return true;
  }
  if (/(^|[._-])k8s_/.test(n)) return true;
  return false;
}

/**
 * Local desktop / Computer Use must not appear as evidence about the remote host.
 * Capability-class only (cua / computer_use) — not task keywords.
 */
export function isLocalDesktopImpersonationActivity(
  name: string,
  detail = "",
): boolean {
  const n = name.trim();
  const d = detail.trim();
  if (/(^|[._-])(cua|computer[_-]?use|desktop[_-]?use|screenshot)([._-]|$)/i.test(n)) {
    return true;
  }
  if (/\bcua\s*\.|computer[_-]?use|getDisplayState|getState\s*\(|desktop\.|screenshot/i.test(d)) {
    return true;
  }
  return false;
}

/** Drop empty placeholder cards (e.g. historical cursor.tool + {}). */
export function isMeaningfulExternalActivity(card: {
  name: string;
  detail: string;
}): boolean {
  const name = card.name.trim();
  const detail = card.detail.trim();
  if (!name) return false;
  if (!detail || detail === "{}" || detail === "[]" || detail === "null") {
    // Bare "*.tool" with no args is noise from bad stream parsing.
    if (/\.tool$/i.test(name) || name === "tool") return false;
  }
  return true;
}

export function externalAgentActivityFromEvent(payload: {
  name?: unknown;
  detail?: unknown;
  ok?: unknown;
  runtime?: unknown;
}): ExternalAgentActivityCard | null {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name) return null;
  if (isMirroredTwMcpActivity(name)) return null;
  const detail =
    typeof payload.detail === "string"
      ? payload.detail.trim()
      : payload.detail != null
        ? String(payload.detail).trim()
        : "";
  if (isLocalDesktopImpersonationActivity(name, detail)) return null;
  let ok: boolean | null = null;
  if (typeof payload.ok === "boolean") ok = payload.ok;
  const runtimeRaw =
    typeof payload.runtime === "string" ? payload.runtime.trim().toLowerCase() : "";
  const runtime: ExternalAgentActivityCard["runtime"] =
    runtimeRaw === "cursor" ||
    runtimeRaw === "codex" ||
    runtimeRaw === "claude"
      ? runtimeRaw
      : "external";
  const card: ExternalAgentActivityCard = { name, detail, ok, runtime };
  if (!isMeaningfulExternalActivity(card)) return null;
  return card;
}

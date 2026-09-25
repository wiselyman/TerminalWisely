/** Map sidecar `external_tool_activity` events → compact chat card model. */

export type ExternalAgentActivityCard = {
  name: string;
  detail: string;
  ok: boolean | null;
  runtime: "cursor" | "codex" | "external";
};

export function externalAgentActivityFromEvent(payload: {
  name?: unknown;
  detail?: unknown;
  ok?: unknown;
  runtime?: unknown;
}): ExternalAgentActivityCard | null {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name) return null;
  const detail =
    typeof payload.detail === "string"
      ? payload.detail.trim()
      : payload.detail != null
        ? String(payload.detail).trim()
        : "";
  let ok: boolean | null = null;
  if (typeof payload.ok === "boolean") ok = payload.ok;
  const runtimeRaw =
    typeof payload.runtime === "string" ? payload.runtime.trim().toLowerCase() : "";
  const runtime =
    runtimeRaw === "cursor" || runtimeRaw === "codex" ? runtimeRaw : "external";
  return { name, detail, ok, runtime };
}

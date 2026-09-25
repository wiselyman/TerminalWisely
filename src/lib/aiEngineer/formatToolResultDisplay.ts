/**
 * Host/sidecar tool payloads include harness envelopes (_note, _untrusted).
 * Those are for the model; the chat exec card must show terminal text only.
 */

const HARNESS_KEYS = new Set([
  "_note",
  "_untrusted",
  "ok",
  "exit_code",
  "exitCode",
  "denied",
  "cancelled",
  "filter_no_match",
]);

export function looksLikeToolResultEnvelope(text: string | null | undefined): boolean {
  const raw = (text || "").trim();
  if (!raw.startsWith("{") || raw.length < 8) return false;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
    return (
      "_untrusted" in obj ||
      "_note" in obj ||
      ("stdout" in obj && ("exit_code" in obj || "ok" in obj))
    );
  } catch {
    return false;
  }
}

/**
 * Prefer already-streamed terminal text. Otherwise unwrap stdout/stderr/error
 * from a harness JSON envelope. Never paint `_note` / `_untrusted` in the UI.
 */
export function formatToolResultForDisplay(
  payload: Record<string, unknown> | null | undefined,
  existingOutput?: string | null,
): string {
  const existing = (existingOutput || "").trim();
  if (existing && !looksLikeToolResultEnvelope(existing)) {
    return existingOutput || "";
  }

  const p = payload && typeof payload === "object" ? payload : {};
  const stdout = typeof p.stdout === "string" ? p.stdout : "";
  const stderr = typeof p.stderr === "string" ? p.stderr : "";
  const error =
    p.error != null && String(p.error).trim() ? String(p.error) : "";
  const parts = [stdout, stderr];
  if (error && p.ok === false) {
    parts.push(error.endsWith("\n") ? error : `${error}\n`);
  }
  const joined = parts.filter((s) => s.length > 0).join("");
  if (joined.trim()) return joined;

  if (typeof p.content === "string" && p.content.trim()) {
    return p.content;
  }

  // web_fetch page body / web_search hits — keep structured for card preview.
  if (typeof p.text === "string" && p.text.trim()) {
    try {
      return JSON.stringify(
        {
          text: p.text,
          ...(typeof p.url === "string" ? { url: p.url } : {}),
          ...(typeof p.status === "number" ? { status: p.status } : {}),
          ...(typeof p.kind === "string" ? { kind: p.kind } : {}),
          ...(typeof p.error === "string" && p.error.trim()
            ? { error: p.error }
            : {}),
          ...(typeof p.markdown === "string" && p.markdown.trim()
            ? { markdown: p.markdown }
            : {}),
        },
        null,
        2,
      );
    } catch {
      return p.text;
    }
  }
  if (Array.isArray(p.results)) {
    try {
      return JSON.stringify({ results: p.results }, null, 2);
    } catch {
      /* fall through */
    }
  }

  // Structured non-terminal results (e.g. k8s rows already stringified in stdout).
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (HARNESS_KEYS.has(k)) continue;
    if (k === "stdout" || k === "stderr" || k === "error") continue;
    rest[k] = v;
  }
  if (Object.keys(rest).length > 0) {
    try {
      return JSON.stringify(rest, null, 2);
    } catch {
      return "";
    }
  }
  return existingOutput || "";
}

/** Unwrap a stored exec-card string that is accidentally a JSON envelope. */
export function unwrapToolOutputForDisplay(text: string | null | undefined): string {
  const raw = text || "";
  if (!looksLikeToolResultEnvelope(raw)) return raw;
  try {
    const obj = JSON.parse(raw.trim()) as Record<string, unknown>;
    return formatToolResultForDisplay(obj, "");
  } catch {
    return raw;
  }
}

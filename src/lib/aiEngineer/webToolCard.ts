/** Compact labels / previews for web_search + web_fetch tool cards. */

export function isWebToolName(name: string | null | undefined): boolean {
  return name === "web_search" || name === "web_fetch";
}

/** Always-visible summary line: search query or fetch URL. */
export function webToolKeywordLine(
  _name: string,
  detail: string | null | undefined,
): string {
  const raw = (detail || "").trim();
  if (!raw) return "";
  // Prefer first line; drop accidental "url:" / "query:" prefixes from dumps.
  const line = raw.split("\n")[0]!.trim();
  return line
    .replace(/^(?:url|query|goal|intent)\s*:\s*/i, "")
    .trim();
}

const PREVIEW_MAX = 600;

function formatSearchHits(hits: unknown[]): string {
  const lines = hits
    .slice(0, 5)
    .map((h) => {
      if (!h || typeof h !== "object") return "";
      const o = h as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title.trim() : "";
      const url = typeof o.url === "string" ? o.url.trim() : "";
      const snip = typeof o.snippet === "string" ? o.snippet.trim() : "";
      if (title && url) return `• ${title}\n  ${url}`;
      if (title) return `• ${title}`;
      if (url) return `• ${url}`;
      if (snip) return `• ${snip.slice(0, 120)}`;
      return "";
    })
    .filter(Boolean);
  return lines.join("\n").slice(0, PREVIEW_MAX);
}

/**
 * Body preview for the card: page text (web_fetch) or hit titles (web_search).
 * Never paints harness `_note` / `_untrusted`.
 */
export function formatWebToolPreview(
  output: string | null | undefined,
): string {
  const raw = (output || "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return formatSearchHits(parsed);
    }
    if (parsed && typeof parsed === "object") {
      const o = parsed as Record<string, unknown>;
      if (Array.isArray(o.results)) {
        return formatSearchHits(o.results);
      }
      if (typeof o.text === "string" && o.text.trim()) {
        return o.text.trim().slice(0, PREVIEW_MAX);
      }
      if (typeof o.error === "string" && o.error.trim()) {
        return o.error.trim().slice(0, PREVIEW_MAX);
      }
      if (typeof o.markdown === "string" && o.markdown.trim()) {
        return o.markdown.trim().slice(0, PREVIEW_MAX);
      }
    }
  } catch {
    // plain text
  }
  return raw.slice(0, PREVIEW_MAX);
}

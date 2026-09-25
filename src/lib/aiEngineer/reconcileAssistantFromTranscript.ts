/** After a run, prefer sidecar transcript over a truncated streamed bubble. */

import { looksIncompleteAssistant } from "./truncatedAssistant";

export type TranscriptAssistantSource = {
  role?: string;
  content?: unknown;
};

export function lastAssistantTextFromTranscript(
  messages: ReadonlyArray<TranscriptAssistantSource>,
): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role !== "assistant") continue;
    const raw = m.content;
    const text =
      typeof raw === "string"
        ? raw
        : Array.isArray(raw)
          ? raw
              .map((part) =>
                part &&
                typeof part === "object" &&
                "text" in part &&
                typeof (part as { text?: unknown }).text === "string"
                  ? (part as { text: string }).text
                  : "",
              )
              .join("")
          : "";
    const trimmed = text.trim();
    if (trimmed) return text;
  }
  return "";
}

/**
 * True when the UI bubble should be replaced by the sidecar's last assistant
 * text — stream dropped the trailing assistant_message/completed payload.
 */
export function shouldReplaceAssistantWithTranscript(opts: {
  uiContent: string;
  transcriptContent: string;
}): boolean {
  const ui = opts.uiContent || "";
  const full = opts.transcriptContent || "";
  if (!full.trim()) return false;
  if (full === ui) return false;
  if (full.length > ui.length && (ui.length === 0 || full.startsWith(ui))) {
    return true;
  }
  if (looksIncompleteAssistant(ui) && !looksIncompleteAssistant(full)) {
    return true;
  }
  if (looksIncompleteAssistant(ui) && full.length > ui.length) {
    return true;
  }
  return false;
}

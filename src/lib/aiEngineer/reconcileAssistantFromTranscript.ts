/** After a run, prefer sidecar transcript over a truncated streamed bubble. */

import { looksIncompleteAssistant } from "./truncatedAssistant";

export type TranscriptAssistantSource = {
  role?: string;
  content?: unknown;
};

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part &&
        typeof part === "object" &&
        "text" in part &&
        typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : "",
      )
      .join("");
  }
  return "";
}

/**
 * Last assistant text that belongs to the latest user turn.
 * Ignores prior-turn assistants left in a resumed SessionLog clone — otherwise
 * an empty streamed bubble gets replaced with e.g. an old 大文件汇总.
 */
export function lastAssistantTextFromTranscript(
  messages: ReadonlyArray<TranscriptAssistantSource>,
): string {
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      lastUser = i;
      break;
    }
  }
  for (let i = messages.length - 1; i > lastUser; i -= 1) {
    const m = messages[i];
    if (m?.role !== "assistant") continue;
    const text = messageText(m.content);
    if (text.trim()) return text;
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

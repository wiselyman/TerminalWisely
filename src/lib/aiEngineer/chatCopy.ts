/** Pure helpers for AI chat copy UX (keeps panel free of untested logic). */

export type CopyableChatLine = {
  kind: string;
  content?: string;
  streaming?: boolean;
};

export function copyableChatText(content: string | null | undefined): string {
  return (content ?? "").trim();
}

export function shouldShowChatCopy(content: string | null | undefined): boolean {
  return copyableChatText(content).length > 0;
}

function turnBounds(
  lines: ReadonlyArray<CopyableChatLine>,
  index: number,
): { start: number; end: number } {
  let start = index;
  while (start > 0 && lines[start - 1]?.kind !== "user") {
    start -= 1;
  }
  let end = index;
  while (end + 1 < lines.length && lines[end + 1]?.kind !== "user") {
    end += 1;
  }
  return { start, end };
}

/**
 * Whole assistant reply for one user turn: join every assistant bubble
 * between the previous user message and the next (tools/notices ignored).
 */
export function wholeAssistantReplyText(
  lines: ReadonlyArray<CopyableChatLine>,
  index: number,
): string {
  if (index < 0 || index >= lines.length) return "";
  if (lines[index]?.kind !== "assistant") {
    return copyableChatText(lines[index]?.content);
  }

  const { start, end } = turnBounds(lines, index);
  const parts: string[] = [];
  for (let i = start; i <= end; i += 1) {
    const line = lines[i];
    if (line?.kind !== "assistant") continue;
    const text = copyableChatText(line.content);
    if (!text) continue;
    if (parts[parts.length - 1] === text) continue; // skip exact dupes
    parts.push(text);
  }
  return parts.join("\n\n");
}

/** Copy control belongs only on the finished last assistant bubble of the turn. */
export function isAssistantReplyCopyAnchor(
  lines: ReadonlyArray<CopyableChatLine>,
  index: number,
): boolean {
  const line = lines[index];
  if (!line || line.kind !== "assistant") return false;
  if (line.streaming) return false;
  if (!shouldShowChatCopy(wholeAssistantReplyText(lines, index))) return false;

  const { start, end } = turnBounds(lines, index);
  let lastAssistant = -1;
  for (let i = start; i <= end; i += 1) {
    if (lines[i]?.kind === "assistant") lastAssistant = i;
  }
  return lastAssistant === index;
}

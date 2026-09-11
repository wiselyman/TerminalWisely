/** Pure helpers for in-panel AI chat find. */

export type ChatFindLine = {
  id: string;
  kind: string;
  content?: string;
  streaming?: boolean;
};

export type ChatFindMatch = {
  lineId: string;
  index: number;
};

function searchableText(line: ChatFindLine): string {
  if (line.kind === "user" || line.kind === "assistant" || line.kind === "error") {
    return (line.content ?? "").trim();
  }
  if (line.kind === "notice" || line.kind === "tool") {
    return (line.content ?? "").trim();
  }
  return "";
}

export function findChatMatches(
  lines: ReadonlyArray<ChatFindLine>,
  query: string,
): ChatFindMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: ChatFindMatch[] = [];
  lines.forEach((line, index) => {
    if (line.kind === "assistant" && line.streaming && !(line.content ?? "").trim()) {
      return;
    }
    const text = searchableText(line).toLowerCase();
    if (!text) return;
    if (text.includes(q)) {
      out.push({ lineId: line.id, index });
    }
  });
  return out;
}

export function stepMatchIndex(
  current: number,
  total: number,
  delta: 1 | -1,
): number {
  if (total <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : total - 1;
  return (current + delta + total) % total;
}

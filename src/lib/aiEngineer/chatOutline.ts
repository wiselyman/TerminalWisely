/** Outline of user/assistant nodes for jump navigation. */

export type ChatOutlineLine = {
  id: string;
  kind: string;
  content?: string;
  streaming?: boolean;
};

export type ChatOutlineNode = {
  id: string;
  kind: "user" | "assistant";
  ordinal: number;
  preview: string;
};

function previewOf(content: string, max = 48): string {
  const t = content.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function buildChatOutline(
  lines: ReadonlyArray<ChatOutlineLine>,
): ChatOutlineNode[] {
  const out: ChatOutlineNode[] = [];
  let userN = 0;
  let assistantN = 0;
  for (const line of lines) {
    if (line.kind !== "user" && line.kind !== "assistant") continue;
    const content = (line.content ?? "").trim();
    if (line.kind === "assistant" && line.streaming && !content) continue;
    if (!content && line.kind === "user") continue;
    if (line.kind === "user") {
      userN += 1;
      out.push({
        id: line.id,
        kind: "user",
        ordinal: userN,
        preview: previewOf(content),
      });
    } else {
      assistantN += 1;
      out.push({
        id: line.id,
        kind: "assistant",
        ordinal: assistantN,
        preview: previewOf(content || "…"),
      });
    }
  }
  return out;
}

export function stepOutlineIndex(
  nodes: ReadonlyArray<ChatOutlineNode>,
  currentId: string | null,
  delta: 1 | -1,
): string | null {
  if (nodes.length === 0) return null;
  const idx = currentId ? nodes.findIndex((n) => n.id === currentId) : -1;
  if (idx < 0) return nodes[delta > 0 ? 0 : nodes.length - 1]?.id ?? null;
  const next = (idx + delta + nodes.length) % nodes.length;
  return nodes[next]?.id ?? null;
}

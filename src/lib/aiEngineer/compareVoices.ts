/** Next-turn history. Parked reference replies stay on screen and stay out of context. */

export type HistoryLine = {
  kind: string;
  content?: string;
  reference?: boolean;
};

export function historyForNextTurn(
  messages: readonly HistoryLine[],
  limit = 16,
): Array<{ role: "user" | "assistant"; content: string }> {
  const rows: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const line of messages) {
    const content = (line.content || "").trim();
    if (!content) continue;
    if (line.kind === "user") {
      rows.push({ role: "user", content: content.slice(0, 4000) });
    } else if (line.kind === "assistant" && !line.reference) {
      rows.push({ role: "assistant", content: content.slice(0, 4000) });
    }
  }
  return rows.slice(-limit);
}

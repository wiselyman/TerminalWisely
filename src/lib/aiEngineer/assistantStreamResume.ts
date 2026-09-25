/** Locate / resume the streaming assistant bubble across harness notices. */

export type ChatLineKind = { kind: string; content?: string; streaming?: boolean };

/** Last assistant message in the current turn (after the latest user). */
export function findLastAssistantIndexInTurn(
  messages: ReadonlyArray<ChatLineKind>,
): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].kind === "user") break;
    if (messages[i].kind === "assistant") return i;
  }
  return -1;
}

/**
 * True when a tool card sits between this assistant bubble and the end of the
 * turn. The post-tool answer must be a new bubble — writing it back into the
 * pre-tool preamble hides it above the command output.
 */
export function hasToolLineAfter(
  messages: ReadonlyArray<ChatLineKind>,
  assistantIndex: number,
): boolean {
  if (assistantIndex < 0) return false;
  for (let i = assistantIndex + 1; i < messages.length; i += 1) {
    const kind = messages[i].kind;
    if (kind === "user") return false;
    if (kind === "tool") return true;
  }
  return false;
}

/** Truncated-answer harness notices must not sit between table halves. */
export function isTruncatedAnswerNotice(line: ChatLineKind | undefined | null): boolean {
  return (
    line?.kind === "notice" &&
    line.content === "act_nudge_truncated_answer"
  );
}

/**
 * Apply a streamed delta so it always extends the turn's last assistant bubble,
 * even when a "回复被截断" notice was appended after that bubble.
 */
export function applyAssistantDeltaToMessages<T extends ChatLineKind>(
  messages: T[],
  text: string,
  opts: {
    looksTruncated: (content: string) => boolean;
    merge: (prev: string, next: string) => string;
    newId: () => string;
  },
): T[] {
  if (!text) return messages;
  const idx = findLastAssistantIndexInTurn(messages);
  // Tool cards after the preamble: this text is the conclusion, not a suffix.
  if (idx < 0 || hasToolLineAfter(messages, idx)) {
    const created = {
      id: opts.newId(),
      kind: "assistant",
      content: text,
      streaming: true,
    };
    return [...messages, created as unknown as T];
  }
  const prev = messages[idx];
  const prevContent = prev.content || "";
  const nextContent =
    prev.streaming || opts.looksTruncated(prevContent)
      ? prev.streaming
        ? prevContent + text
        : opts.merge(prevContent, text)
      : prevContent + text;
  // Drop mid-turn truncated-answer notices so the table stays one bubble.
  const withoutTruncNotices = messages.filter(
    (m, i) => i <= idx || !isTruncatedAnswerNotice(m),
  );
  const adjIdx = findLastAssistantIndexInTurn(withoutTruncNotices);
  if (adjIdx < 0) return messages;
  return [
    ...withoutTruncNotices.slice(0, adjIdx),
    {
      ...withoutTruncNotices[adjIdx],
      content: nextContent,
      streaming: true,
    },
    ...withoutTruncNotices.slice(adjIdx + 1),
  ];
}

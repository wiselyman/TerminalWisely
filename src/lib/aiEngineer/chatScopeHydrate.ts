/** Whether the visible transcript still needs bodies from disk (index-only hydrate). */

export function needsDiskMessageHydration(
  messages: ReadonlyArray<{ kind: string }>,
): boolean {
  return !messages.some((m) => m.kind === "user" || m.kind === "assistant");
}

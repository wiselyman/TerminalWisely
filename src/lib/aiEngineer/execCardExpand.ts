/** Exec-card expand/collapse policy (Cursor-like: open while live, fold when done). */

export function nextExecCardExpanded(opts: {
  live: boolean;
  running: boolean;
  /** User manually opened a finished card — keep open until it runs again. */
  userPinnedOpen: boolean;
}): { expanded: boolean; clearUserPin: boolean } {
  if (opts.live || opts.running) {
    return { expanded: true, clearUserPin: true };
  }
  if (opts.userPinnedOpen) {
    return { expanded: true, clearUserPin: false };
  }
  return { expanded: false, clearUserPin: false };
}

/**
 * When a card above the fold shrinks, keep the same content under the viewport
 * by reducing scrollTop by the lost height (only the portion that was above).
 */
export function scrollTopAfterCollapseAbove(opts: {
  scrollTop: number;
  /** Card offsetTop relative to the scroller's content box. */
  cardOffsetTop: number;
  heightDelta: number;
}): number {
  const delta = opts.heightDelta;
  if (delta <= 0) return opts.scrollTop;
  const top = opts.scrollTop;
  const cardTop = opts.cardOffsetTop;
  if (cardTop + delta <= top) {
    return Math.max(0, top - delta);
  }
  if (cardTop < top) {
    const above = top - cardTop;
    return Math.max(0, top - Math.min(above, delta));
  }
  return top;
}

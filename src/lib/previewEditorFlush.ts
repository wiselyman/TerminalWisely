const flushByTabId = new Map<string, () => string>();

export function registerPreviewEditorFlush(
  tabId: string,
  flush: () => string,
): void {
  flushByTabId.set(tabId, flush);
}

export function unregisterPreviewEditorFlush(tabId: string): void {
  flushByTabId.delete(tabId);
}

export function flushPreviewEditor(tabId: string): string | null {
  return flushByTabId.get(tabId)?.() ?? null;
}

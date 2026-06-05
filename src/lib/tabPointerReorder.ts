const DRAG_THRESHOLD_PX = 4;
const TAB_REORDERING_CLASS = "tab-reordering";

export interface TabPointerReorderOptions {
  tabId: string;
  startX: number;
  startY: number;
  onPreview: (target: { id: string; position: "before" | "after" } | null) => void;
  onReorder: (
    dragId: string,
    targetId: string,
    position: "before" | "after",
  ) => void;
  onEnd?: () => void;
}

function findTabTarget(
  x: number,
  y: number,
  dragId: string,
): { id: string; position: "before" | "after" } | null {
  const element = document.elementFromPoint(x, y)?.closest<HTMLElement>(
    ".tab[data-session-id]",
  );
  if (!element?.dataset.sessionId) return null;

  const targetId = element.dataset.sessionId;
  if (targetId === dragId) return null;

  const rect = element.getBoundingClientRect();
  const position = x < rect.left + rect.width / 2 ? "before" : "after";
  return { id: targetId, position };
}

/** Pointer drag for tab reorder — HTML5 DnD conflicts with file drop in WebView. */
export function startTabPointerReorder(
  options: TabPointerReorderOptions,
): () => void {
  let dragging = false;
  let disposed = false;

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("mouseup", onUp, true);
    document.body.classList.remove(TAB_REORDERING_CLASS);
    options.onPreview(null);
    options.onEnd?.();
  };

  const onMove = (event: MouseEvent) => {
    if (disposed) return;

    const dx = event.clientX - options.startX;
    const dy = event.clientY - options.startY;

    if (!dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      dragging = true;
      document.body.classList.add(TAB_REORDERING_CLASS);
    }

    event.preventDefault();
    options.onPreview(findTabTarget(event.clientX, event.clientY, options.tabId));
  };

  const onUp = (event: MouseEvent) => {
    if (dragging) {
      const target = findTabTarget(event.clientX, event.clientY, options.tabId);
      if (target) {
        options.onReorder(options.tabId, target.id, target.position);
      }
    }
    cleanup();
  };

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("mouseup", onUp, true);

  return cleanup;
}

export function isTabReordering(): boolean {
  return document.body.classList.contains(TAB_REORDERING_CLASS);
}

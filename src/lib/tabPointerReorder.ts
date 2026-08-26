const DRAG_THRESHOLD_PX = 4;
const TAB_REORDERING_CLASS = "tab-reordering";
const TAB_DRAGGING_CLASS = "tab-reorder-dragging";
const TAB_GHOST_CLASS = "tab-drag-ghost";

export interface TabPointerReorderOptions {
  tabId: string;
  tabElement: HTMLElement;
  startX: number;
  startY: number;
  onDragStart?: () => void;
  onPreview: (target: { id: string; position: "before" | "after" } | null) => void;
  onReorder: (
    dragId: string,
    targetId: string,
    position: "before" | "after",
  ) => void;
  onEnd?: () => void;
}

function getTabBar(tabElement: HTMLElement): HTMLElement | null {
  return tabElement.closest<HTMLElement>(".tab-bar");
}

function clampYToTabBar(y: number, tabBar: HTMLElement | null): number {
  if (!tabBar) return y;
  const rect = tabBar.getBoundingClientRect();
  return Math.min(Math.max(y, rect.top + 2), rect.bottom - 2);
}

function findTabTarget(
  x: number,
  y: number,
  dragId: string,
  tabBar: HTMLElement | null,
): { id: string; position: "before" | "after" } | null {
  const probeY = clampYToTabBar(y, tabBar);
  const element = document.elementFromPoint(x, probeY)?.closest<HTMLElement>(
    ".tab[data-session-id]",
  );
  if (!element?.dataset.sessionId) return null;

  const targetId = element.dataset.sessionId;
  if (targetId === dragId) return null;

  const rect = element.getBoundingClientRect();
  const position = x < rect.left + rect.width / 2 ? "before" : "after";
  return { id: targetId, position };
}

interface TabDragGhost {
  move: (x: number) => void;
  destroy: () => void;
}

function createTabDragGhost(
  tabElement: HTMLElement,
  startX: number,
): TabDragGhost {
  const rect = tabElement.getBoundingClientRect();
  const offsetX = startX - rect.left;
  const anchorTop = rect.top;

  const ghost = tabElement.cloneNode(true) as HTMLElement;
  ghost.classList.add(TAB_GHOST_CLASS);
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.appendChild(ghost);

  tabElement.classList.add(TAB_DRAGGING_CLASS);

  const move = (x: number) => {
    ghost.style.left = `${x - offsetX}px`;
    ghost.style.top = `${anchorTop}px`;
  };

  move(startX);

  return {
    move,
    destroy: () => {
      ghost.remove();
      tabElement.classList.remove(TAB_DRAGGING_CLASS);
    },
  };
}

/** Pointer drag for tab reorder — HTML5 DnD conflicts with file drop in WebView. */
export function startTabPointerReorder(
  options: TabPointerReorderOptions,
): () => void {
  let dragging = false;
  let disposed = false;
  let ghost: TabDragGhost | null = null;
  const tabBar = getTabBar(options.tabElement);

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("mouseup", onUp, true);
    document.body.classList.remove(TAB_REORDERING_CLASS);
    ghost?.destroy();
    ghost = null;
    options.onPreview(null);
    options.onEnd?.();
  };

  const onMove = (event: MouseEvent) => {
    if (disposed) return;

    const dx = event.clientX - options.startX;
    const dy = event.clientY - options.startY;

    if (!dragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      if (Math.abs(dy) > Math.abs(dx)) return;
      dragging = true;
      document.body.classList.add(TAB_REORDERING_CLASS);
      ghost = createTabDragGhost(options.tabElement, options.startX);
      options.onDragStart?.();
    }

    event.preventDefault();
    ghost?.move(event.clientX);
    options.onPreview(
      findTabTarget(event.clientX, event.clientY, options.tabId, tabBar),
    );
  };

  const onUp = (event: MouseEvent) => {
    if (dragging) {
      const target = findTabTarget(
        event.clientX,
        event.clientY,
        options.tabId,
        tabBar,
      );
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

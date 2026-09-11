const DRAG_THRESHOLD_PX = 4;
const TAB_REORDERING_CLASS = "tab-reordering";
const TAB_DRAGGING_CLASS = "tab-reorder-dragging";
const TAB_GHOST_CLASS = "tab-drag-ghost";
const TAB_DROP_BEFORE = "tab-reorder-drop-before";
const TAB_DROP_AFTER = "tab-reorder-drop-after";

export interface TabReorderTarget {
  id: string;
  position: "before" | "after";
}

export interface TabPointerReorderOptions {
  tabId: string;
  tabElement: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  onDragStart?: () => void;
  onPreview: (target: TabReorderTarget | null) => void;
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

function clearDropMarkers(tabBar: HTMLElement | null) {
  tabBar
    ?.querySelectorAll(`.${TAB_DROP_BEFORE}, .${TAB_DROP_AFTER}`)
    .forEach((el) => {
      el.classList.remove(TAB_DROP_BEFORE, TAB_DROP_AFTER);
    });
}

function applyDropMarker(
  tabBar: HTMLElement | null,
  target: TabReorderTarget | null,
) {
  clearDropMarkers(tabBar);
  if (!target || !tabBar) return;
  const el = [
    ...tabBar.querySelectorAll<HTMLElement>(".tab[data-session-id]"),
  ].find((tab) => tab.dataset.sessionId === target.id);
  if (!el) return;
  el.classList.add(
    target.position === "before" ? TAB_DROP_BEFORE : TAB_DROP_AFTER,
  );
}

function clampYToTabBar(y: number, tabBar: HTMLElement | null): number {
  if (!tabBar) return y;
  const rect = tabBar.getBoundingClientRect();
  return Math.min(Math.max(y, rect.top + 2), rect.bottom - 2);
}

export function findTabReorderTarget(
  x: number,
  y: number,
  dragId: string,
  tabBar: HTMLElement | null,
): TabReorderTarget | null {
  if (!tabBar) return null;
  const probeY = clampYToTabBar(y, tabBar);
  const tabs = [
    ...tabBar.querySelectorAll<HTMLElement>(".tab[data-session-id]"),
  ].filter((tab) => tab.dataset.sessionId !== dragId);

  if (tabs.length === 0) return null;

  for (const tab of tabs) {
    const rect = tab.getBoundingClientRect();
    if (x < rect.left || x > rect.right) continue;
    if (probeY < rect.top - 4 || probeY > rect.bottom + 4) continue;
    const position = x < rect.left + rect.width / 2 ? "before" : "after";
    return { id: tab.dataset.sessionId!, position };
  }

  // Past the ends of the strip: snap to first/last neighbor.
  const first = tabs[0];
  const last = tabs[tabs.length - 1];
  const firstRect = first.getBoundingClientRect();
  const lastRect = last.getBoundingClientRect();
  if (x < firstRect.left) {
    return { id: first.dataset.sessionId!, position: "before" };
  }
  if (x > lastRect.right) {
    return { id: last.dataset.sessionId!, position: "after" };
  }
  return null;
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
  // Keep layout width so neighbors do not jump under the cursor.
  const placeholderWidth = `${rect.width}px`;

  const ghost = tabElement.cloneNode(true) as HTMLElement;
  ghost.classList.remove(
    TAB_DRAGGING_CLASS,
    TAB_DROP_BEFORE,
    TAB_DROP_AFTER,
  );
  ghost.classList.add(TAB_GHOST_CLASS);
  ghost.removeAttribute("data-session-id");
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.position = "fixed";
  ghost.style.width = placeholderWidth;
  ghost.style.height = `${rect.height}px`;
  ghost.style.opacity = "0.96";
  ghost.style.zIndex = "30000";
  ghost.style.pointerEvents = "none";
  document.body.appendChild(ghost);

  tabElement.classList.add(TAB_DRAGGING_CLASS);
  tabElement.style.width = placeholderWidth;
  tabElement.style.minWidth = placeholderWidth;
  tabElement.style.maxWidth = placeholderWidth;
  tabElement.style.flex = `0 0 ${placeholderWidth}`;

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
      tabElement.style.width = "";
      tabElement.style.minWidth = "";
      tabElement.style.maxWidth = "";
      tabElement.style.flex = "";
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
  let lastTargetKey: string | null = null;
  const tabBar = getTabBar(options.tabElement);

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    options.tabElement.releasePointerCapture?.(options.pointerId);
    document.removeEventListener("pointermove", onMove, true);
    document.removeEventListener("pointerup", onUp, true);
    document.removeEventListener("pointercancel", onUp, true);
    document.body.classList.remove(TAB_REORDERING_CLASS);
    clearDropMarkers(tabBar);
    ghost?.destroy();
    ghost = null;
    options.onPreview(null);
    options.onEnd?.();
  };

  const onMove = (event: PointerEvent) => {
    if (disposed) return;
    if (event.pointerId !== options.pointerId) return;

    const dx = event.clientX - options.startX;
    const dy = event.clientY - options.startY;

    if (!dragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) {
        return;
      }
      // Prefer horizontal tab-strip drags; ignore mostly-vertical gestures.
      if (Math.abs(dy) > Math.abs(dx) * 1.5) {
        cleanup();
        return;
      }
      dragging = true;
      ghost = createTabDragGhost(options.tabElement, options.startX);
      options.onDragStart?.();
    }

    event.preventDefault();
    ghost?.move(event.clientX);
    const target = findTabReorderTarget(
      event.clientX,
      event.clientY,
      options.tabId,
      tabBar,
    );
    const key = target ? `${target.id}:${target.position}` : null;
    if (key !== lastTargetKey) {
      lastTargetKey = key;
      applyDropMarker(tabBar, target);
      options.onPreview(target);
    }
  };

  const onUp = (event: PointerEvent) => {
    if (event.pointerId !== options.pointerId) return;
    if (dragging) {
      const target = findTabReorderTarget(
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

  // Disable only the titlebar drag spacer for this gesture (see CSS).
  document.body.classList.add(TAB_REORDERING_CLASS);
  try {
    options.tabElement.setPointerCapture(options.pointerId);
  } catch {
    // Some WebViews reject capture; document listeners still work.
  }
  document.addEventListener("pointermove", onMove, true);
  document.addEventListener("pointerup", onUp, true);
  document.addEventListener("pointercancel", onUp, true);

  return cleanup;
}

export function isTabReordering(): boolean {
  return document.body.classList.contains(TAB_REORDERING_CLASS);
}

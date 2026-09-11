const DRAG_THRESHOLD_PX = 4;
const REORDERING_CLASS = "entity-list-reordering";
const DRAGGING_CLASS = "entity-row-dragging";
const DROP_BEFORE_CLASS = "entity-drop-before";
const DROP_AFTER_CLASS = "entity-drop-after";
const DROP_INTO_CLASS = "entity-drop-into";

export type EntityDropTarget =
  | { kind: "item"; id: string; position: "before" | "after" }
  | { kind: "group"; id: string; position?: "before" | "after" }
  | null;

export interface EntityPointerReorderOptions {
  dragId: string;
  dragKind: "item" | "group";
  rowElement: HTMLElement;
  listRoot: HTMLElement;
  startX: number;
  startY: number;
  onDragStart?: () => void;
  onPreview: (target: EntityDropTarget) => void;
  onDrop: (target: EntityDropTarget) => void;
  onEnd?: () => void;
}

function findItemTarget(
  x: number,
  y: number,
  dragId: string,
  listRoot: HTMLElement,
): Extract<EntityDropTarget, { kind: "item" }> | null {
  const element = document.elementFromPoint(x, y)?.closest<HTMLElement>(
    "[data-entity-item-id]",
  );
  if (!element?.dataset.entityItemId) return null;
  const targetId = element.dataset.entityItemId;
  if (targetId === dragId) return null;
  if (!listRoot.contains(element)) return null;
  const rect = element.getBoundingClientRect();
  const position = y < rect.top + rect.height / 2 ? "before" : "after";
  return { kind: "item", id: targetId, position };
}

function findGroupTarget(
  x: number,
  y: number,
  dragId: string,
  dragKind: "item" | "group",
  listRoot: HTMLElement,
): Extract<EntityDropTarget, { kind: "group" }> | null {
  const element = document.elementFromPoint(x, y)?.closest<HTMLElement>(
    "[data-entity-group-id]",
  );
  if (!element?.dataset.entityGroupId) return null;
  const targetId = element.dataset.entityGroupId;
  if (targetId === dragId) return null;
  if (!listRoot.contains(element)) return null;
  if (dragKind === "group") {
    const rect = element.getBoundingClientRect();
    const position = y < rect.top + rect.height / 2 ? "before" : "after";
    return { kind: "group", id: targetId, position };
  }
  return { kind: "group", id: targetId };
}

function findDropTarget(
  x: number,
  y: number,
  dragId: string,
  dragKind: "item" | "group",
  listRoot: HTMLElement,
): EntityDropTarget {
  if (dragKind === "group") {
    return findGroupTarget(x, y, dragId, dragKind, listRoot);
  }
  const group = findGroupTarget(x, y, dragId, dragKind, listRoot);
  if (group) return group;
  return findItemTarget(x, y, dragId, listRoot);
}

function clearDropMarkers(listRoot: HTMLElement) {
  listRoot
    .querySelectorAll(
      `.${DROP_BEFORE_CLASS}, .${DROP_AFTER_CLASS}, .${DROP_INTO_CLASS}`,
    )
    .forEach((el) => {
      el.classList.remove(DROP_BEFORE_CLASS, DROP_AFTER_CLASS, DROP_INTO_CLASS);
    });
}

function applyDropMarker(listRoot: HTMLElement, target: EntityDropTarget) {
  clearDropMarkers(listRoot);
  if (!target) return;
  if (target.kind === "group") {
    const header = listRoot.querySelector<HTMLElement>(
      `[data-entity-group-id="${target.id}"]`,
    );
    if (target.position) {
      const section = header?.closest<HTMLElement>(".entity-list-section");
      section?.classList.add(
        target.position === "before" ? DROP_BEFORE_CLASS : DROP_AFTER_CLASS,
      );
      return;
    }
    header?.classList.add(DROP_INTO_CLASS);
    return;
  }
  const el = listRoot.querySelector<HTMLElement>(
    `[data-entity-item-id="${target.id}"]`,
  );
  if (!el) return;
  el.classList.add(
    target.position === "before" ? DROP_BEFORE_CLASS : DROP_AFTER_CLASS,
  );
}

interface DragGhost {
  move: (x: number, y: number) => void;
  destroy: () => void;
}

function createDragGhost(
  rowElement: HTMLElement,
  startX: number,
  startY: number,
): DragGhost {
  const rect = rowElement.getBoundingClientRect();
  const offsetX = startX - rect.left;
  const offsetY = startY - rect.top;
  const ghost = rowElement.cloneNode(true) as HTMLElement;
  ghost.classList.add("entity-drag-ghost");
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.width = `${rect.width}px`;
  document.body.appendChild(ghost);
  rowElement.classList.add(DRAGGING_CLASS);

  const move = (x: number, y: number) => {
    ghost.style.left = `${x - offsetX}px`;
    ghost.style.top = `${y - offsetY}px`;
  };
  move(startX, startY);

  return {
    move,
    destroy: () => {
      ghost.remove();
      rowElement.classList.remove(DRAGGING_CLASS);
    },
  };
}

/** Pointer drag for sidebar entity lists — avoids HTML5 DnD in WebView. */
export function startEntityPointerReorder(
  options: EntityPointerReorderOptions,
): () => void {
  let dragging = false;
  let disposed = false;
  let ghost: DragGhost | null = null;

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("mouseup", onUp, true);
    document.body.classList.remove(REORDERING_CLASS);
    clearDropMarkers(options.listRoot);
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
      if (
        Math.abs(dx) < DRAG_THRESHOLD_PX &&
        Math.abs(dy) < DRAG_THRESHOLD_PX
      ) {
        return;
      }
      dragging = true;
      document.body.classList.add(REORDERING_CLASS);
      ghost = createDragGhost(
        options.rowElement,
        options.startX,
        options.startY,
      );
      options.onDragStart?.();
    }
    event.preventDefault();
    ghost?.move(event.clientX, event.clientY);
    const target = findDropTarget(
      event.clientX,
      event.clientY,
      options.dragId,
      options.dragKind,
      options.listRoot,
    );
    applyDropMarker(options.listRoot, target);
    options.onPreview(target);
  };

  const onUp = (event: MouseEvent) => {
    if (dragging) {
      const target = findDropTarget(
        event.clientX,
        event.clientY,
        options.dragId,
        options.dragKind,
        options.listRoot,
      );
      if (target) options.onDrop(target);
    }
    cleanup();
  };

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("mouseup", onUp, true);
  return cleanup;
}

export function isEntityListReordering(): boolean {
  return document.body.classList.contains(REORDERING_CLASS);
}

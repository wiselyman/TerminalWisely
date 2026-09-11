/**
 * Pointer-based Host tree move.
 * HTML5 DnD conflicts with xterm / Tauri file-drop in WebView
 * (same reason as tabPointerReorder / remotePointerDrag).
 */
import { canDropMove, dropMoveTargetDir } from "./localFsOps";

const DRAG_THRESHOLD_PX = 4;
const MOVING_CLASS = "local-fs-tree-moving";

export { DRAG_THRESHOLD_PX };

export type TreeDropHit = {
  path: string;
  kind: string;
};

export type LocalFsPointerMoveOptions = {
  paths: string[];
  pointerId: number;
  startX: number;
  startY: number;
  onPreview: (targetPath: string | null) => void;
  onDrop: (destDir: string) => void;
  onCancel?: () => void;
  onEnd?: () => void;
};

export function isLocalFsTreeMoving(): boolean {
  return document.body.classList.contains(MOVING_CLASS);
}

export function findTreeDropHit(x: number, y: number): TreeDropHit | null {
  const el = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>(".local-fs-tree-row[data-path]");
  if (!el) return null;
  const path = el.dataset.path?.trim();
  const kind = el.dataset.kind?.trim();
  if (!path || !kind) return null;
  return { path, kind };
}

/** Pure: map a hover hit to a valid move destination, or null. */
export function resolveTreeMoveDrop(
  draggedPaths: string[],
  hit: TreeDropHit | null,
): { destDir: string; highlightPath: string } | null {
  if (!hit || draggedPaths.length === 0) return null;
  if (draggedPaths.includes(hit.path)) return null;
  const destDir = dropMoveTargetDir(hit.kind, hit.path);
  if (!canDropMove(draggedPaths, destDir).ok) return null;
  return { destDir, highlightPath: hit.path };
}

function createGhost(label: string, x: number, y: number): HTMLElement {
  const ghost = document.createElement("div");
  ghost.className = "local-fs-tree-move-ghost";
  ghost.setAttribute("aria-hidden", "true");
  ghost.textContent = label;
  ghost.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
  document.body.appendChild(ghost);
  return ghost;
}

export function startLocalFsPointerMove(
  options: LocalFsPointerMoveOptions,
): () => void {
  let dragging = false;
  let disposed = false;
  let ghost: HTMLElement | null = null;
  let lastHighlight: string | null = null;

  const label =
    options.paths.length === 1
      ? (options.paths[0].split("/").pop() || options.paths[0])
      : `${options.paths.length} items`;

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    document.removeEventListener("pointermove", onMove, true);
    document.removeEventListener("pointerup", onUp, true);
    document.removeEventListener("pointercancel", onUp, true);
    document.body.classList.remove(MOVING_CLASS);
    ghost?.remove();
    ghost = null;
    if (lastHighlight !== null) {
      lastHighlight = null;
      options.onPreview(null);
    }
    options.onEnd?.();
  };

  const onMove = (event: PointerEvent) => {
    if (disposed || event.pointerId !== options.pointerId) return;

    const dx = event.clientX - options.startX;
    const dy = event.clientY - options.startY;

    if (!dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      dragging = true;
      document.body.classList.add(MOVING_CLASS);
      ghost = createGhost(label, event.clientX, event.clientY);
    }

    event.preventDefault();
    if (ghost) {
      ghost.style.transform = `translate(${event.clientX + 12}px, ${event.clientY + 12}px)`;
    }

    const resolved = resolveTreeMoveDrop(
      options.paths,
      findTreeDropHit(event.clientX, event.clientY),
    );
    const highlight = resolved?.highlightPath ?? null;
    if (highlight !== lastHighlight) {
      lastHighlight = highlight;
      options.onPreview(highlight);
    }
  };

  const onUp = (event: PointerEvent) => {
    if (event.pointerId !== options.pointerId) return;
    if (dragging) {
      const resolved = resolveTreeMoveDrop(
        options.paths,
        findTreeDropHit(event.clientX, event.clientY),
      );
      if (resolved) {
        options.onDrop(resolved.destDir);
      } else {
        options.onCancel?.();
      }
    }
    cleanup();
  };

  document.addEventListener("pointermove", onMove, true);
  document.addEventListener("pointerup", onUp, true);
  document.addEventListener("pointercancel", onUp, true);

  return cleanup;
}

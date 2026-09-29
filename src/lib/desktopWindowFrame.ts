import type { DesktopAppId } from "../stores/desktopStore";

export interface DesktopWindowFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DESKTOP_FRAME_DEFAULT = { width: 1120, height: 760 };
export const DESKTOP_FRAME_MIN = { width: 480, height: 320 };

export type DesktopResizeEdge =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

export const DESKTOP_RESIZE_EDGES: DesktopResizeEdge[] = [
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw",
];

type Bounds = { width: number; height: number };

export function clampDesktopFrame(
  frame: DesktopWindowFrame,
  bounds: Bounds,
): DesktopWindowFrame {
  const minW = Math.min(DESKTOP_FRAME_MIN.width, Math.max(0, bounds.width));
  const minH = Math.min(DESKTOP_FRAME_MIN.height, Math.max(0, bounds.height));
  const width = Math.max(minW, Math.min(frame.width, Math.max(minW, bounds.width)));
  const height = Math.max(minH, Math.min(frame.height, Math.max(minH, bounds.height)));
  const x = Math.min(Math.max(0, frame.x), Math.max(0, bounds.width - width));
  const y = Math.min(Math.max(0, frame.y), Math.max(0, bounds.height - height));
  return { x, y, width, height };
}

export function centerDesktopFrame(bounds: Bounds): DesktopWindowFrame {
  const width = Math.min(DESKTOP_FRAME_DEFAULT.width, bounds.width);
  const height = Math.min(DESKTOP_FRAME_DEFAULT.height, bounds.height);
  return clampDesktopFrame(
    {
      x: (bounds.width - width) / 2,
      y: (bounds.height - height) / 2,
      width,
      height,
    },
    bounds,
  );
}

export function moveDesktopFrame(
  start: DesktopWindowFrame,
  dx: number,
  dy: number,
  bounds: Bounds,
): DesktopWindowFrame {
  return clampDesktopFrame(
    {
      x: start.x + dx,
      y: start.y + dy,
      width: start.width,
      height: start.height,
    },
    bounds,
  );
}

export function resizeDesktopFrame(
  start: DesktopWindowFrame,
  edge: DesktopResizeEdge,
  dx: number,
  dy: number,
  bounds: Bounds,
): DesktopWindowFrame {
  let { x, y, width, height } = start;
  if (edge.includes("e")) width += dx;
  if (edge.includes("s")) height += dy;
  if (edge.includes("w")) {
    width -= dx;
    x += dx;
  }
  if (edge.includes("n")) {
    height -= dy;
    y += dy;
  }
  return clampDesktopFrame({ x, y, width, height }, bounds);
}

type WindowFlags = { open: boolean; minimized: boolean };

/** The topmost open, not-minimized desktop window. */
export function frontDesktopApp(
  focusOrder: readonly DesktopAppId[],
  apps: Partial<Record<DesktopAppId, WindowFlags>>,
): DesktopAppId | null {
  for (let i = focusOrder.length - 1; i >= 0; i -= 1) {
    const id = focusOrder[i];
    const win = apps[id];
    if (win?.open && !win.minimized) return id;
  }
  return null;
}

export function browserDesktopIsFront(
  focusOrder: readonly DesktopAppId[],
  apps: Partial<Record<DesktopAppId, WindowFlags>>,
): boolean {
  return frontDesktopApp(focusOrder, apps) === "browser";
}

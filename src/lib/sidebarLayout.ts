export const SIDEBAR_WIDTH_DEFAULT = 240;
export const SIDEBAR_WIDTH_MIN = 200;
export const SIDEBAR_WIDTH_MAX = 360;
export const SIDEBAR_COLLAPSED_WIDTH = 0;
export const SIDEBAR_COLLAPSED_STORAGE_KEY = "terminal-wisely.sidebar-collapsed";
export const SIDEBAR_WIDTH_STORAGE_KEY = "terminal-wisely.sidebar-width";

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return SIDEBAR_WIDTH_DEFAULT;
  }
  return Math.min(
    SIDEBAR_WIDTH_MAX,
    Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)),
  );
}

export function loadSidebarWidth(): number {
  const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
  if (!raw) {
    return SIDEBAR_WIDTH_DEFAULT;
  }
  return clampSidebarWidth(Number(raw));
}

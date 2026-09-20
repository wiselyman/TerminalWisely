/**
 * Stacking for host floats (must stay consistent with App.css).
 * Preview/editor must sit above dock apps (files / processes / browser).
 */
export const DESKTOP_APP_FLOAT_Z_BASE = 34000;
export const PREVIEW_FLOAT_Z = 35000;
export const PREVIEW_DOCK_Z = 35001;

export function desktopAppFloatZ(focusRank: number): number {
  return DESKTOP_APP_FLOAT_Z_BASE + Math.max(0, focusRank);
}

export function previewCoversDesktopApps(
  desktopZBase = DESKTOP_APP_FLOAT_Z_BASE,
  previewZ = PREVIEW_FLOAT_Z,
): boolean {
  // Leave headroom for a few stacked dock apps (focusOrder ranks).
  return previewZ > desktopZBase + 100;
}

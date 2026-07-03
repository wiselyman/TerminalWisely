const WORKSPACE_PANEL_WIDTH_KEY = "terminal-wisely.workspace-panel-width";
const LEGACY_WIDTH_KEYS = [
  "terminal-wisely.task-manager-width",
  "terminal-wisely.find-width",
  "terminal-wisely.host-stats-width",
  "terminal-wisely.command-nav-width",
] as const;

export const DEFAULT_WORKSPACE_PANEL_WIDTH = 400;
export const MIN_WORKSPACE_PANEL_WIDTH = 320;
export const MAX_WORKSPACE_PANEL_WIDTH = 720;

type WidthListener = (width: number) => void;
const listeners = new Set<WidthListener>();

export function clampWorkspacePanelWidth(width: number): number {
  return Math.max(
    MIN_WORKSPACE_PANEL_WIDTH,
    Math.min(width, MAX_WORKSPACE_PANEL_WIDTH),
  );
}

function migrateLegacyWidth(): number | null {
  let max = 0;
  for (const key of LEGACY_WIDTH_KEYS) {
    const value = Number(localStorage.getItem(key));
    if (Number.isFinite(value) && value > 0) {
      max = Math.max(max, value);
    }
  }
  return max > 0 ? clampWorkspacePanelWidth(max) : null;
}

export function readWorkspacePanelWidth(): number {
  const stored = Number(localStorage.getItem(WORKSPACE_PANEL_WIDTH_KEY));
  if (Number.isFinite(stored) && stored > 0) {
    return clampWorkspacePanelWidth(stored);
  }

  const migrated = migrateLegacyWidth();
  if (migrated != null) {
    localStorage.setItem(WORKSPACE_PANEL_WIDTH_KEY, String(migrated));
    return migrated;
  }

  return DEFAULT_WORKSPACE_PANEL_WIDTH;
}

export function subscribeWorkspacePanelWidth(
  listener: WidthListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setWorkspacePanelWidth(width: number): number {
  const next = clampWorkspacePanelWidth(width);
  localStorage.setItem(WORKSPACE_PANEL_WIDTH_KEY, String(next));
  listeners.forEach((listener) => listener(next));
  return next;
}

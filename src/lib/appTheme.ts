/** App chrome + terminal color scheme (persisted). */

export type AppTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "terminal-wisely.theme";
export const THEME_CHANGE_EVENT = "tw-theme-change";

const THEMES: readonly AppTheme[] = ["dark", "light"];

export function isAppTheme(value: unknown): value is AppTheme {
  return value === "dark" || value === "light";
}

export function readStoredTheme(): AppTheme | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isAppTheme(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Default stays dark (current product look). */
export function resolveAppTheme(): AppTheme {
  return readStoredTheme() ?? "dark";
}

export function getAppTheme(): AppTheme {
  if (typeof document === "undefined") return resolveAppTheme();
  const attr = document.documentElement.getAttribute("data-theme");
  return isAppTheme(attr) ? attr : resolveAppTheme();
}

export function applyAppTheme(theme: AppTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

export function setAppTheme(theme: AppTheme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore quota / private mode
  }
  applyAppTheme(theme);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(THEME_CHANGE_EVENT, { detail: theme }),
    );
  }
}

export function subscribeAppTheme(
  listener: (theme: AppTheme) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const onChange = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (isAppTheme(detail)) listener(detail);
    else listener(getAppTheme());
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    listener(resolveAppTheme());
  };
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export type XtermTheme = {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
};

export function terminalThemeFor(theme: AppTheme): XtermTheme {
  if (theme === "light") {
    return {
      background: "#ffffff",
      foreground: "#1f2328",
      cursor: "#0969da",
      selectionBackground: "#0969da44",
    };
  }
  return {
    background: "#0d1117",
    foreground: "#e6edf3",
    cursor: "#58a6ff",
    selectionBackground: "#264f78",
  };
}

export function listAppThemes(): readonly AppTheme[] {
  return THEMES;
}

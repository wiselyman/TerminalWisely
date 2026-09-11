import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/noto-sans-mono/400.css";
import "@fontsource/noto-sans-mono/700.css";

import { isWindowsHost } from "./hostOs";

function isMacHost(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() ?? "";
  return platform.includes("mac") || ua.includes("macintosh");
}

const BUNDLED_MONO = "'JetBrains Mono', 'Noto Sans Mono'";

/** Monospace stack tuned per host OS (xterm canvas + CJK). */
export function getTerminalFontFamily(): string {
  if (isWindowsHost()) {
    return `'Cascadia Code', 'Cascadia Mono', Consolas, ${BUNDLED_MONO}, monospace`;
  }
  if (isMacHost()) {
    return `'JetBrains Mono', 'SF Mono', Menlo, Monaco, 'Cascadia Code', ${BUNDLED_MONO}, monospace`;
  }
  return [
    "'JetBrains Mono'",
    "'Noto Sans Mono'",
    "'Ubuntu Mono'",
    "'Noto Sans Mono CJK SC'",
    "'DejaVu Sans Mono'",
    "monospace",
  ].join(", ");
}

/** Default / reset size (px). */
export const TERMINAL_FONT_SIZE = 14;
export const TERMINAL_FONT_SIZE_MIN = 10;
export const TERMINAL_FONT_SIZE_MAX = 32;
export const TERMINAL_LINE_HEIGHT = 1.25;

const FONT_SIZE_STORAGE_KEY = "tw.terminal.fontSize";

type FontSizeListener = (size: number) => void;

let cachedFontSize: number | null = null;
const listeners = new Set<FontSizeListener>();

export function clampTerminalFontSize(size: number): number {
  if (!Number.isFinite(size)) return TERMINAL_FONT_SIZE;
  return Math.min(
    TERMINAL_FONT_SIZE_MAX,
    Math.max(TERMINAL_FONT_SIZE_MIN, Math.round(size)),
  );
}

export function getTerminalFontSize(): number {
  if (cachedFontSize != null) return cachedFontSize;
  try {
    const raw = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    if (raw != null) {
      cachedFontSize = clampTerminalFontSize(Number(raw));
      return cachedFontSize;
    }
  } catch {
    /* ignore */
  }
  cachedFontSize = TERMINAL_FONT_SIZE;
  return cachedFontSize;
}

export function setTerminalFontSize(size: number): number {
  const next = clampTerminalFontSize(size);
  cachedFontSize = next;
  try {
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(next));
  } catch {
    /* ignore */
  }
  for (const listener of listeners) {
    listener(next);
  }
  return next;
}

export function adjustTerminalFontSize(delta: number): number {
  return setTerminalFontSize(getTerminalFontSize() + delta);
}

export function subscribeTerminalFontSize(listener: FontSizeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Cmd/Ctrl + / - / = for terminal font zoom.
 * Returns true when the event was handled (caller should preventDefault).
 */
export function handleTerminalFontSizeHotkey(event: KeyboardEvent): boolean {
  if (event.type !== "keydown") return false;
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return false;
  const key = event.key;
  if (key === "=" || key === "+" || key === "Add") {
    adjustTerminalFontSize(1);
    return true;
  }
  if (key === "-" || key === "_" || key === "Subtract") {
    adjustTerminalFontSize(-1);
    return true;
  }
  if (key === "0") {
    setTerminalFontSize(TERMINAL_FONT_SIZE);
    return true;
  }
  return false;
}

const BUNDLED_FAMILIES = ["JetBrains Mono", "Noto Sans Mono"] as const;
const FONT_LOAD_TIMEOUT_MS = 2500;

/**
 * Best-effort font preload for xterm glyph metrics.
 * Must never reject or hang: WebKitGTK on Linux (incl. ARM64) can stall on
 * document.fonts.ready or reject loads for weights not in @font-face.
 */
export async function ensureTerminalFontsLoaded(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) {
    return;
  }

  const px = `${getTerminalFontSize()}px`;
  const loads = [
    ...BUNDLED_FAMILIES.map((family) =>
      document.fonts.load(`${px} "${family}"`),
    ),
    ...BUNDLED_FAMILIES.map((family) =>
      document.fonts.load(`700 ${px} "${family}"`),
    ),
  ];

  try {
    await Promise.race([
      Promise.allSettled(loads),
      new Promise<void>((resolve) => setTimeout(resolve, FONT_LOAD_TIMEOUT_MS)),
    ]);
  } catch {
    // Ignore — terminal must still open with fallback fonts.
  }
}

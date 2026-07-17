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

export const TERMINAL_FONT_SIZE = 14;
export const TERMINAL_LINE_HEIGHT = 1.25;

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

  const px = `${TERMINAL_FONT_SIZE}px`;
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

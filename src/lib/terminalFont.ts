import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/noto-sans-mono/400.css";

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

/** Wait for bundled woff2 faces before xterm measures glyphs. */
export async function ensureTerminalFontsLoaded(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) {
    return;
  }

  const px = `${TERMINAL_FONT_SIZE}px`;
  await Promise.all(
    BUNDLED_FAMILIES.flatMap((family) => [
      document.fonts.load(`${px} "${family}"`),
      document.fonts.load(`500 ${px} "${family}"`),
    ]),
  );
  await document.fonts.ready;
}

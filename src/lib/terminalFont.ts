import { isWindowsHost } from "./hostOs";

function isMacHost(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() ?? "";
  return platform.includes("mac") || ua.includes("macintosh");
}

/** Monospace stack tuned per host OS (xterm canvas + CJK). */
export function getTerminalFontFamily(): string {
  if (isWindowsHost()) {
    return "'Cascadia Code', 'Cascadia Mono', Consolas, monospace";
  }
  if (isMacHost()) {
    return "'JetBrains Mono', 'SF Mono', Menlo, Monaco, 'Cascadia Code', monospace";
  }
  return [
    "'JetBrains Mono'",
    "'Fira Code'",
    "'Cascadia Mono'",
    "'Ubuntu Mono'",
    "'Noto Sans Mono CJK SC'",
    "'Noto Sans Mono'",
    "'DejaVu Sans Mono'",
    "monospace",
  ].join(", ");
}

export const TERMINAL_FONT_SIZE = 14;
export const TERMINAL_LINE_HEIGHT = 1.25;

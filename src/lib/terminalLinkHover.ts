import type { IDisposable, Terminal } from "@xterm/xterm";
import { rangeToColumns, type LineColumnMap } from "./terminalLinks";

type BufferLine = {
  getCell: (col: number) => { getWidth: () => number } | undefined | null;
};

/** Draw link underline via xterm decoration (0-based columns) instead of built-in cell underline. */
export function mountLinkHoverUnderline(
  terminal: Terminal,
  bufferLineNumber: number,
  map: LineColumnMap,
  line: BufferLine,
  start: number,
  end: number,
): IDisposable | undefined {
  const { startCol, width } = rangeToColumns(map, line, start, end);
  const buffer = terminal.buffer.active;
  const cursorLine = buffer.baseY + buffer.cursorY;
  const marker = terminal.registerMarker(bufferLineNumber - 1 - cursorLine);
  if (!marker) return undefined;

  const decoration = terminal.registerDecoration({
    marker,
    x: startCol,
    width,
  });
  if (!decoration) {
    marker.dispose();
    return undefined;
  }

  decoration.onRender((element) => {
    element.style.boxSizing = "border-box";
    element.style.pointerEvents = "none";
    element.style.borderBottom =
      "1px solid color-mix(in srgb, var(--tw-accent, #58a6ff) 85%, transparent)";
  });

  return {
    dispose: () => {
      decoration.dispose();
      marker.dispose();
    },
  };
}

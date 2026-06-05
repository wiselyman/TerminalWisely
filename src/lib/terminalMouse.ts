import type { Terminal } from "@xterm/xterm";
import {
  buildLineColumnMap,
  findRemotePathMatches,
  rangeToColumns,
} from "./terminalLinks";
import { getLinePlainText, resolvePathFromListing } from "./terminalContext";

export interface TerminalMouseCell {
  col: number;
  bufferLineNumber: number;
}

export function getTerminalMouseCell(
  terminal: Terminal,
  screenElement: HTMLElement,
  event: MouseEvent,
): TerminalMouseCell | null {
  const rect = screenElement.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const col = Math.floor((x / rect.width) * terminal.cols);
  const row = Math.floor((y / rect.height) * terminal.rows);

  if (col < 0 || col >= terminal.cols || row < 0 || row >= terminal.rows) {
    return null;
  }

  return {
    col,
    bufferLineNumber: terminal.buffer.active.viewportY + row + 1,
  };
}

export function findRemotePathAtCell(
  terminal: Terminal,
  cell: TerminalMouseCell,
): string | null {
  const line = terminal.buffer.active.getLine(cell.bufferLineNumber - 1);
  if (!line) return null;

  const map = buildLineColumnMap(line);
  const matches = findRemotePathMatches(map.plain);
  if (matches.length === 0) return null;

  const getLinePlain = (lineNumber: number) =>
    getLinePlainText(
      (n) => terminal.buffer.active.getLine(n - 1),
      lineNumber,
    );

  for (const match of matches) {
    const { startCol, width } = rangeToColumns(
      map,
      line,
      match.start,
      match.end,
    );
    if (cell.col >= startCol && cell.col < startCol + width) {
      return resolvePathFromListing(
        getLinePlain,
        terminal.buffer.active.length,
        cell.bufferLineNumber,
        match.path,
      );
    }
  }

  return null;
}

export function isRemoteDragModifier(event: MouseEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    !event.altKey
  );
}

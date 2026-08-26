import type { Terminal } from "@xterm/xterm";
import {
  buildLineColumnMap,
  findRemotePathMatches,
  rangeToColumns,
} from "./terminalLinks";
import { getLinePlainText, isLineInLsOutput, resolvePathFromListing } from "./terminalContext";

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

export interface RemotePathAtCell {
  path: string;
  directoryHint: boolean;
}

export interface RemotePathHit extends RemotePathAtCell {
  bufferLineNumber: number;
  startCol: number;
  colWidth: number;
}

export interface TerminalPathHighlightAnchor {
  bufferLineNumber: number;
  startCol: number;
  colWidth: number;
}

export interface TerminalPathHighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function computeTerminalPathHighlightRect(
  terminal: Terminal,
  screenElement: HTMLElement,
  containerElement: HTMLElement,
  bufferLineNumber: number,
  startCol: number,
  colWidth: number,
): TerminalPathHighlightRect | null {
  const screenRect = screenElement.getBoundingClientRect();
  const containerRect = containerElement.getBoundingClientRect();
  if (screenRect.width <= 0 || screenRect.height <= 0) {
    return null;
  }

  const viewportRow = bufferLineNumber - terminal.buffer.active.viewportY - 1;
  if (viewportRow < 0 || viewportRow >= terminal.rows) {
    return null;
  }

  const cellW = screenRect.width / terminal.cols;
  const cellH = screenRect.height / terminal.rows;
  const padX = Math.max(6, Math.round(cellW * 0.2));
  const padY = Math.max(5, Math.round(cellH * 0.2));

  const rawTop = screenRect.top - containerRect.top + viewportRow * cellH;
  const rawLeft = screenRect.left - containerRect.left + startCol * cellW;
  const rawWidth = colWidth * cellW;
  const rawHeight = cellH;

  return {
    top: rawTop - padY,
    left: rawLeft - padX,
    width: Math.max(1, rawWidth + padX * 2),
    height: Math.max(1, rawHeight + padY * 2),
  };
}

export function findRemotePathHitAtCell(
  terminal: Terminal,
  cell: TerminalMouseCell,
): RemotePathHit | null {
  const line = terminal.buffer.active.getLine(cell.bufferLineNumber - 1);
  if (!line) return null;

  const map = buildLineColumnMap(line);
  const getLinePlain = (lineNumber: number) =>
    getLinePlainText(
      (n) => terminal.buffer.active.getLine(n - 1),
      lineNumber,
    );
  const matches = findRemotePathMatches(map.plain, {
    inLsOutput: isLineInLsOutput(getLinePlain, cell.bufferLineNumber),
  });
  if (matches.length === 0) return null;

  for (const match of matches) {
    const { startCol, width } = rangeToColumns(
      map,
      line,
      match.start,
      match.end,
    );
    if (cell.col >= startCol && cell.col < startCol + width) {
      return {
        path: resolvePathFromListing(
          getLinePlain,
          terminal.buffer.active.length,
          cell.bufferLineNumber,
          match.path,
        ),
        directoryHint: match.isDirectory === true,
        bufferLineNumber: cell.bufferLineNumber,
        startCol,
        colWidth: width,
      };
    }
  }

  return null;
}

export function findRemotePathAtCell(
  terminal: Terminal,
  cell: TerminalMouseCell,
): RemotePathAtCell | null {
  const hit = findRemotePathHitAtCell(terminal, cell);
  if (!hit) return null;
  return { path: hit.path, directoryHint: hit.directoryHint };
}

export function isRemoteDragModifier(event: MouseEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    !event.altKey
  );
}

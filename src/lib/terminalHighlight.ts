import type { IDisposable, Terminal } from "@xterm/xterm";
import { buildLineColumnMap, rangeToColumns } from "./terminalLinks";

const highlightDisposables = new Map<string, IDisposable[]>();
const retryTimers = new Map<string, number[]>();
const fadeTimers = new Map<string, number>();

function clearHighlightDecorations(sessionId: string) {
  const items = highlightDisposables.get(sessionId) ?? [];
  for (const item of items) {
    item.dispose();
  }
  highlightDisposables.delete(sessionId);

  const fade = fadeTimers.get(sessionId);
  if (fade !== undefined) {
    window.clearTimeout(fade);
    fadeTimers.delete(sessionId);
  }
}

export function clearUploadHighlights(sessionId: string) {
  clearHighlightDecorations(sessionId);

  const timers = retryTimers.get(sessionId) ?? [];
  for (const timer of timers) {
    window.clearTimeout(timer);
  }
  retryTimers.delete(sessionId);
}

function isWordBoundary(text: string, start: number, end: number): boolean {
  const beforeOk = start === 0 || /[\s/]/.test(text[start - 1] ?? " ");
  const afterOk = end >= text.length || /\s/.test(text[end] ?? " ");
  return beforeOk && afterOk;
}

export function highlightUploadedFiles(
  terminal: Terminal,
  sessionId: string,
  filenames: string[],
): number {
  if (filenames.length === 0) return 0;

  clearHighlightDecorations(sessionId);

  const buffer = terminal.buffer.active;
  const cursorLine = buffer.baseY + buffer.cursorY;
  const disposables: IDisposable[] = [];
  const highlighted = new Set<string>();

  for (let lineIndex = buffer.length - 1; lineIndex >= 0; lineIndex -= 1) {
    const line = buffer.getLine(lineIndex);
    if (!line) continue;

    const map = buildLineColumnMap(line);
    if (!map.plain.trim()) continue;

    for (const filename of filenames) {
      if (highlighted.has(filename)) continue;

      let searchFrom = 0;
      while (searchFrom <= map.plain.length) {
        const idx = map.plain.indexOf(filename, searchFrom);
        if (idx < 0) break;
        const end = idx + filename.length;
        if (isWordBoundary(map.plain, idx, end)) {
          const marker = terminal.registerMarker(lineIndex - cursorLine);
          if (!marker) break;

          const { startCol, width } = rangeToColumns(map, line, idx, end);
          const decoration = terminal.registerDecoration({
            marker,
            x: startCol,
            width,
            backgroundColor: "#3fb95055",
          });

          if (!decoration) {
            marker.dispose();
            break;
          }

          decoration.onRender((element) => {
            element.style.boxSizing = "border-box";
            element.style.outline = "1px solid #3fb950";
            element.style.borderRadius = "2px";
            element.style.boxShadow = "0 0 0 1px #3fb950 inset";
          });

          disposables.push(marker, decoration);
          highlighted.add(filename);
          break;
        }
        searchFrom = idx + 1;
      }
    }

    if (highlighted.size === filenames.length) {
      break;
    }
  }

  if (disposables.length > 0) {
    highlightDisposables.set(sessionId, disposables);
    const fadeTimer = window.setTimeout(() => {
      clearHighlightDecorations(sessionId);
    }, 8000);
    fadeTimers.set(sessionId, fadeTimer);
  }

  return highlighted.size;
}

export function scheduleUploadHighlight(
  terminal: Terminal,
  sessionId: string,
  filenames: string[],
): void {
  if (filenames.length === 0) return;

  const existing = retryTimers.get(sessionId) ?? [];
  for (const timer of existing) {
    window.clearTimeout(timer);
  }

  const delays = [120, 350, 700, 1200];
  const timers = delays.map((delay) =>
    window.setTimeout(() => {
      highlightUploadedFiles(terminal, sessionId, filenames);
    }, delay),
  );
  retryTimers.set(sessionId, timers);
}

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

export interface LineColumnMap {
  plain: string;
  indexToCol: number[];
  plainLength: number;
}

export function buildLineColumnMap(
  line: { length: number; getCell: (col: number) => { getChars: () => string; getWidth: () => number } | undefined | null } | undefined,
): LineColumnMap {
  if (!line) {
    return { plain: "", indexToCol: [0], plainLength: 0 };
  }

  let plain = "";
  const indexToCol: number[] = [];

  for (let col = 0; col < line.length; ) {
    const cell = line.getCell(col);
    if (!cell) {
      col += 1;
      continue;
    }

    const chars = stripAnsi(cell.getChars() ?? "");
    const cellWidth = cell.getWidth() || 1;
    if (chars) {
      indexToCol[plain.length] = col;
      plain += chars;
    }
    col += cellWidth;
  }

  const plainLength = plain.length;
  indexToCol[plainLength] = line.length;
  return { plain, indexToCol, plainLength };
}

export function rangeToColumns(
  map: LineColumnMap,
  line: { getCell: (col: number) => { getWidth: () => number } | undefined | null },
  start: number,
  end: number,
): { startCol: number; width: number } {
  const startCol = map.indexToCol[start] ?? 0;
  if (end <= start) {
    return { startCol, width: 1 };
  }

  let endCol: number;
  if (end < map.plainLength) {
    endCol = map.indexToCol[end] ?? startCol + 1;
  } else {
    const lastCharCol = map.indexToCol[end - 1] ?? startCol;
    const lastCell = line.getCell(lastCharCol);
    endCol = lastCharCol + (lastCell?.getWidth() || 1);
  }

  return { startCol, width: Math.max(1, endCol - startCol) };
}

export interface RemotePathMatch {
  path: string;
  start: number;
  end: number;
}

interface LineToken {
  value: string;
  start: number;
  end: number;
}

function tokenizeLine(text: string): LineToken[] {
  const tokens: LineToken[] = [];
  let index = 0;

  while (index < text.length) {
    while (index < text.length && /\s/.test(text[index])) {
      index += 1;
    }
    if (index >= text.length) break;

    if (text[index] === "'" || text[index] === '"') {
      const quote = text[index];
      index += 1;
      const valueStart = index;
      while (index < text.length && text[index] !== quote) {
        index += 1;
      }
      const value = text.slice(valueStart, index);
      const valueEnd = index;
      if (index < text.length) {
        index += 1;
      }
      if (value) {
        tokens.push({ value, start: valueStart, end: valueEnd });
      }
      continue;
    }

    const start = index;
    while (index < text.length && !/\s/.test(text[index])) {
      index += 1;
    }
    const value = text.slice(start, index);
    if (value) {
      tokens.push({ value, start, end: index });
    }
  }

  return tokens;
}

function normalizePathToken(token: string): string {
  return token.replace(/[/\\]+$/, "").replace(/[$#]+$/, "");
}

function isFilesystemPathPrefix(token: string): boolean {
  return (
    token.startsWith("/") ||
    token.startsWith("~/") ||
    token.startsWith("./") ||
    token.startsWith("../") ||
    /^[A-Za-z]:[\\/]/u.test(token)
  );
}

function isContainerImageReference(token: string): boolean {
  const normalized = normalizePathToken(token);
  if (isFilesystemPathPrefix(normalized)) {
    return false;
  }
  if (!normalized.includes("/") && !normalized.includes(":")) {
    return false;
  }

  if (!normalized.includes("/") && /^[\w.-]+:[\w][\w.-]*$/u.test(normalized)) {
    return true;
  }

  if (!normalized.includes("/")) {
    return false;
  }

  const slashIndex = normalized.indexOf("/");
  const head = normalized.slice(0, slashIndex);
  const hasTag = normalized.includes(":");
  const looksLikeRegistry = head.includes(".") || hasTag;

  if (!looksLikeRegistry) {
    return false;
  }

  return /^[\w.-]+(?:(?:\/[\w.-]+)+)?(?::[\w][\w.-]*)?$/u.test(normalized);
}

function isNonLinkableLine(line: string): boolean {
  const trimmed = line.trim();
  if (/^Last login:/i.test(trimmed)) return true;
  if (/^[\w.-]+:\s/.test(trimmed)) return true;
  if (/^(IMAGE|REPOSITORY|CONTAINER ID|NAMES?|PORTS|STATUS|COMMAND|CREATED|TAG|DIGEST|ID)\s+/i.test(trimmed)) {
    return true;
  }
  if (/^(PID|USER|CPU|MEM|VSZ|RSS|TTY|STAT|START|TIME|COMMAND)\s+/i.test(trimmed)) {
    return true;
  }
  if (trimmed.includes("没有那个") || /no such file/i.test(trimmed)) return true;
  return false;
}

function isNoiseToken(token: string): boolean {
  if (/^\d+$/.test(token)) return true;
  if (/^\d{4}$/.test(token)) return true;
  if (/^(\d{1,2}:\d{2}(?::\d{2})?)$/.test(token)) return true;
  if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i.test(token)) {
    return true;
  }
  if (/^\d+\.\d+([KMGTPEZY]?B?)?$/i.test(token)) return true;
  if (/^\d+\.?\d*[KMGTPEZY]B?$/i.test(token)) return true;
  if (/^[0-9a-f]{7,}$/i.test(token)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return true;
  }
  if (/^v?\d+\.\d+(\.\d+)*([+-][\w.-]+)?$/i.test(token)) return true;
  if (/^\d+(?:\.\d+)?%$/.test(token)) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(token)) return true;
  if (/^(Up|Exited|Created|Paused|Restarting|Running|Dead|Removed)$/i.test(token)) {
    return true;
  }
  if (/^\d+\s*(?:second|minute|hour|day|week|month|year)s?\s*ago$/i.test(token)) {
    return true;
  }
  if (/^(?:\d+\s*)?(?:second|minute|hour|day|week|month|year)s?\s*ago$/i.test(token)) {
    return true;
  }
  return false;
}

function hasFilenameExtension(token: string): boolean {
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot === token.length - 1) return false;

  const ext = token.slice(dot + 1);
  if (!/^[\w\u0080-\uFFFF-]{1,32}$/u.test(ext)) return false;
  if (/^\d+$/u.test(ext)) return false;
  if (!/[A-Za-z\u0080-\uFFFF]/u.test(ext)) return false;

  const prefix = token.slice(0, dot);
  if (/^\d+$/.test(prefix)) return false;
  if (/^\d+\.\d*$/.test(token)) return false;

  return true;
}

function isListEntryToken(token: string): boolean {
  const normalized = normalizePathToken(token);
  if (!normalized || normalized === ".") return false;
  if (normalized === "..") return true;
  if (/[$#]/.test(normalized)) return false;
  if (isNoiseToken(normalized)) return false;
  if (isContainerImageReference(normalized)) return false;
  if (normalized.includes("/") || normalized.includes(":")) return false;
  if (normalized.includes("->")) return false;
  if (hasFilenameExtension(normalized)) return true;
  if (/^[\w.\u0080-\uFFFF-]+$/u.test(normalized) && normalized.length <= 255) {
    return true;
  }
  return false;
}

function parseLsLongLine(plain: string): RemotePathMatch[] {
  const trimmed = plain.trim();
  if (!/^[dl-][-rwxlpStTDSsNBb?]{9}[+@]?/.test(trimmed)) {
    return [];
  }

  const tokens = tokenizeLine(trimmed);
  if (tokens.length === 0) return [];

  const last = tokens[tokens.length - 1];
  const path = normalizePathToken(last.value);
  if (!isListEntryToken(path)) return [];

  return [
    {
      path,
      start: last.start,
      end: last.end,
    },
  ];
}

function pushMatch(
  matches: RemotePathMatch[],
  seen: Set<string>,
  path: string,
  start: number,
  end: number,
) {
  const normalized = normalizePathToken(path);
  if (!normalized) return;
  if (isContainerImageReference(normalized)) return;
  if (isNoiseToken(normalized)) return;
  const key = `${start}:${normalized}`;
  if (seen.has(key)) return;
  seen.add(key);
  matches.push({ path: normalized, start, end });
}

export interface RemotePathMatchOptions {
  /** Set when this line is output from a recent `ls` command in the buffer. */
  inLsOutput?: boolean;
}

export function findRemotePathMatches(
  text: string,
  options?: RemotePathMatchOptions,
): RemotePathMatch[] {
  const plain = stripAnsi(text);
  if (isNonLinkableLine(plain)) {
    return [];
  }

  const lsLongMatches = parseLsLongLine(plain);
  if (lsLongMatches.length > 0) {
    const matches: RemotePathMatch[] = [];
    const seen = new Set<string>();
    for (const match of lsLongMatches) {
      pushMatch(matches, seen, match.path, match.start, match.end);
    }
    return matches;
  }

  if (!options?.inLsOutput) {
    return [];
  }

  const matches: RemotePathMatch[] = [];
  const seen = new Set<string>();

  for (const token of tokenizeLine(plain)) {
    const path = normalizePathToken(token.value);
    if (!isListEntryToken(path)) continue;
    pushMatch(matches, seen, path, token.start, token.end);
  }

  return matches.sort((a, b) => a.start - b.start);
}

export function findRemotePaths(text: string): string[] {
  return findRemotePathMatches(text).map((match) => match.path);
}

export function isModifierClick(event: MouseEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

export function isShiftClick(event: MouseEvent): boolean {
  return event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/** xterm link activate runs on mouseup — ignore right/middle button. */
export function isPrimaryLinkActivate(event: MouseEvent): boolean {
  return event.button === 0;
}

export function quotePath(path: string): string {
  return `"${path.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function extractDroppedPaths(
  event: Pick<DragEvent, "dataTransfer">,
): string[] {
  const paths: string[] = [];
  if (event.dataTransfer?.files?.length) {
    for (const file of Array.from(event.dataTransfer.files)) {
      const tauriPath = (file as File & { path?: string }).path;
      if (tauriPath) {
        paths.push(tauriPath);
      }
    }
  }

  const plain = event.dataTransfer?.getData("text/plain");
  if (plain && paths.length === 0) {
    paths.push(...plain.split("\n").map((p) => p.trim()).filter(Boolean));
  }

  return paths;
}

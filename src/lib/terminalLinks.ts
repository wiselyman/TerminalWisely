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

function isLikelyShellPromptLine(line: string): boolean {
  const trimmed = line.trim();
  if (/:(~(?:\/[^\s$#]*)?|\/[^\s$#]*)\s*[$#]/.test(trimmed)) return true;
  if (/[@:][^$#\s]+[$#]/.test(trimmed)) return true;
  return false;
}

function getPromptEndIndex(line: string): number | null {
  const plain = stripAnsi(line);
  const match = plain.match(/:(~(?:\/[^\s$#]*)?|\/[^\s$#]*)\s*[$#]/);
  if (!match || match.index === undefined) {
    return null;
  }
  return match.index + match[0].length;
}

function isNonLinkableLine(line: string): boolean {
  const trimmed = line.trim();
  if (/^[\w.-]+:\s/.test(trimmed)) return true;
  if (/^(IMAGE|REPOSITORY|CONTAINER ID)\s+/i.test(trimmed)) return true;
  if (trimmed.includes("没有那个") || /no such file/i.test(trimmed)) return true;
  return false;
}

function isNoiseToken(token: string): boolean {
  if (/^\d+$/.test(token)) return true;
  if (/^\d{4}$/.test(token)) return true;
  if (/^(\d{1,2}:\d{2})$/.test(token)) return true;
  if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i.test(token)) {
    return true;
  }
  return false;
}

function isExplicitPath(token: string): boolean {
  if (!token || token === ".") return false;
  if (isContainerImageReference(token)) return false;

  if (isFilesystemPathPrefix(token)) {
    return true;
  }

  if (token.includes("/") || token.includes(":")) {
    return false;
  }

  return /\.[^./\\:]{1,32}$/u.test(token);
}

function isListEntryToken(token: string): boolean {
  const normalized = normalizePathToken(token);
  if (!normalized || normalized === ".") return false;
  if (normalized === "..") return true;
  if (/[$#]/.test(normalized)) return false;
  if (isNoiseToken(normalized)) return false;
  if (isContainerImageReference(normalized)) return false;
  if (normalized.includes("/") || normalized.includes(":")) return false;
  if (/^[\w.\u0080-\uFFFF-]+$/u.test(normalized) && normalized.length <= 255) {
    return true;
  }
  return false;
}

function parseLsLongLine(plain: string): RemotePathMatch[] {
  const trimmed = plain.trim();
  if (!/^[dl-][-rwxlpStTDSsNBb?]{9,}/.test(trimmed)) {
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
  const key = `${start}:${normalized}`;
  if (seen.has(key)) return;
  seen.add(key);
  matches.push({ path: normalized, start, end });
}

export function findRemotePathMatches(text: string): RemotePathMatch[] {
  const plain = stripAnsi(text);
  if (isNonLinkableLine(plain)) {
    return [];
  }
  const matches: RemotePathMatch[] = [];
  const seen = new Set<string>();
  const onPromptLine = isLikelyShellPromptLine(plain);
  const promptEnd = onPromptLine ? getPromptEndIndex(plain) : null;

  for (const match of parseLsLongLine(plain)) {
    pushMatch(matches, seen, match.path, match.start, match.end);
  }

  for (const token of tokenizeLine(plain)) {
    if (promptEnd !== null && token.start < promptEnd) {
      continue;
    }
    const path = normalizePathToken(token.value);
    if (onPromptLine) {
      if (!isExplicitPath(path)) continue;
    } else if (!isListEntryToken(path) && !isExplicitPath(path)) {
      continue;
    }
    pushMatch(matches, seen, path, token.start, token.end);
  }

  const inlinePathPattern = /(?:^|\s)((?:~\/|\.\/|\.\.\/|\/)[^\s'"$#]+)/gu;
  for (const match of plain.matchAll(inlinePathPattern)) {
    const path = match[1];
    const start = (match.index ?? 0) + match[0].length - path.length;
    if (promptEnd !== null && start < promptEnd) {
      continue;
    }
    const end = start + path.length;
    pushMatch(matches, seen, path, start, end);
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

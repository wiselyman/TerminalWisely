export interface SearchMatch {
  start: number;
  end: number;
}

export interface SearchOptions {
  caseSensitive?: boolean;
  regex?: boolean;
  wholeWord?: boolean;
}

export interface MatchPosition {
  line: number;
  column: number;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSearchPattern(
  query: string,
  options: SearchOptions,
): RegExp | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const flags = options.caseSensitive ? "g" : "gi";
  try {
    let source = options.regex ? trimmed : escapeRegex(trimmed);
    if (options.wholeWord) {
      source = `\\b${source}\\b`;
    }
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

export function isValidSearchQuery(
  query: string,
  options: SearchOptions,
): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  if (!options.regex) return true;
  return buildSearchPattern(trimmed, options) !== null;
}

export function findSearchMatches(
  text: string,
  query: string,
  options: SearchOptions = {},
): SearchMatch[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const pattern = buildSearchPattern(trimmed, options);
  if (!pattern) return [];

  const matches: SearchMatch[] = [];
  let match: RegExpExecArray | null;
  pattern.lastIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    matches.push({ start, end });
    if (match[0].length === 0) {
      pattern.lastIndex += 1;
    }
  }

  return matches;
}

export function getMatchPosition(text: string, index: number): MatchPosition {
  const before = text.slice(0, index);
  const lines = before.split("\n");
  return {
    line: lines.length,
    column: (lines[lines.length - 1]?.length ?? 0) + 1,
  };
}

export function splitTextWithHighlights(
  text: string,
  matches: SearchMatch[],
  activeIndex: number,
): Array<{ text: string; highlight: boolean; active: boolean }> {
  if (matches.length === 0) {
    return [{ text, highlight: false, active: false }];
  }

  const parts: Array<{ text: string; highlight: boolean; active: boolean }> =
    [];
  let cursor = 0;

  matches.forEach((match, index) => {
    if (match.start > cursor) {
      parts.push({
        text: text.slice(cursor, match.start),
        highlight: false,
        active: false,
      });
    }
    parts.push({
      text: text.slice(match.start, match.end),
      highlight: true,
      active: index === activeIndex,
    });
    cursor = match.end;
  });

  if (cursor < text.length) {
    parts.push({
      text: text.slice(cursor),
      highlight: false,
      active: false,
    });
  }

  return parts;
}

function decodeHtmlEntity(entity: string): string {
  switch (entity) {
    case "&lt;":
      return "<";
    case "&gt;":
      return ">";
    case "&amp;":
      return "&";
    case "&quot;":
      return '"';
    case "&#39;":
    case "&apos;":
      return "'";
    default:
      if (entity.startsWith("&#x") || entity.startsWith("&#X")) {
        const code = Number.parseInt(entity.slice(3, -1), 16);
        return Number.isNaN(code) ? entity : String.fromCodePoint(code);
      }
      if (entity.startsWith("&#")) {
        const code = Number.parseInt(entity.slice(2, -1), 10);
        return Number.isNaN(code) ? entity : String.fromCodePoint(code);
      }
      return entity;
  }
}

function readHtmlTextChar(html: string, index: number): {
  nextIndex: number;
  char: string;
} {
  if (html[index] === "&") {
    const semi = html.indexOf(";", index);
    if (semi > index) {
      const entity = html.slice(index, semi + 1);
      return { nextIndex: semi + 1, char: decodeHtmlEntity(entity) };
    }
  }
  return { nextIndex: index + 1, char: html[index] };
}

/** Overlay search <mark> tags onto syntax-highlighted HTML. */
export function injectSearchHighlights(
  html: string,
  matches: SearchMatch[],
  activeIndex: number,
): string {
  if (matches.length === 0) return html;

  let matchIdx = 0;
  let plainIdx = 0;
  let out = "";
  let markOpen = false;

  const closeMark = () => {
    if (markOpen) {
      out += "</mark>";
      markOpen = false;
    }
  };

  const openMark = (active: boolean) => {
    closeMark();
    out += active
      ? '<mark class="preview-search-hit preview-search-active">'
      : '<mark class="preview-search-hit">';
    markOpen = true;
  };

  for (let i = 0; i < html.length; ) {
    if (html[i] === "<") {
      const close = html.indexOf(">", i);
      if (close === -1) {
        out += html.slice(i);
        break;
      }
      out += html.slice(i, close + 1);
      i = close + 1;
      continue;
    }

    const { nextIndex, char } = readHtmlTextChar(html, i);
    const match = matches[matchIdx];
    const inMatch =
      match != null && plainIdx >= match.start && plainIdx < match.end;

    if (inMatch && !markOpen) {
      openMark(matchIdx === activeIndex);
    } else if (!inMatch && markOpen) {
      closeMark();
    }

    out += html.slice(i, nextIndex);
    plainIdx += char.length;
    i = nextIndex;

    if (match != null && plainIdx >= match.end) {
      closeMark();
      matchIdx += 1;
    }
  }

  closeMark();
  return out;
}

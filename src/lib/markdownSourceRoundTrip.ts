import hljs from "highlight.js/lib/core";
import "./syntaxHighlight";

const vditorRenderedLanguages = new Set([
  "abc", "echarts", "flowchart", "graphviz", "markmap", "math", "mermaid",
  "mindmap", "plantuml", "smiles", "wavedrom",
]);

export interface MarkdownRoundTripSegment {
  id: string;
  source: string;
  editable: boolean;
  compatibilityKind?: MarkdownCompatibilityKind;
}

export type MarkdownCompatibilityKind = "front-matter" | "raw-html" | "unknown-fence" | "unclosed-fence" | "reference-definition" | "container-directive";

export interface MarkdownCompatibilityAnchor {
  segmentId: string;
  token: string;
  compatibilityKind: MarkdownCompatibilityKind;
  preview: string;
}

export interface MarkdownRoundTripProjection {
  source: string;
  anchors: MarkdownCompatibilityAnchor[];
}

export interface MarkdownRoundTripDocument {
  original: string;
  segments: MarkdownRoundTripSegment[];
  hasCompatibilityContent: boolean;
}

function sourceLines(source: string): string[] {
  return source.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function isRawHtml(line: string): boolean {
  return /<!--|<![A-Z]|<\/?[A-Za-z][\w:-]*(?:\s|\/?>)/i.test(line);
}

function compatibilityLines(lines: string[]): Array<MarkdownCompatibilityKind | null> {
  const kinds = lines.map(() => null as MarkdownCompatibilityKind | null);
  let index = 0;

  if (lines.length > 0 && /^---\s*(?:\r?\n)?$/.test(lines[0])) {
    let end = lines.length - 1;
    for (let cursor = 1; cursor < lines.length; cursor += 1) {
      if (/^(?:---|\.\.\.)\s*(?:\r?\n)?$/.test(lines[cursor])) {
        end = cursor;
        break;
      }
    }
    for (; index <= end; index += 1) kinds[index] = "front-matter";
  }

  while (index < lines.length) {
    const line = lines[index];
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)/);
    if (fence) {
      const marker = fence[1];
      const info = fence[2].trim().split(/[\s{]/, 1)[0].toLowerCase();
      const knownLanguage = !info || info === "text" || info === "plaintext" ||
        Boolean(hljs.getLanguage(info)) || vditorRenderedLanguages.has(info);
      let end = lines.length - 1;
      let closed = false;
      const closePattern = new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*(?:\\r?\\n)?$`);
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        if (closePattern.test(lines[cursor])) {
          end = cursor;
          closed = true;
          break;
        }
      }
      if (!knownLanguage || !closed) {
        const kind = closed ? "unknown-fence" : "unclosed-fence";
        for (let cursor = index; cursor <= end; cursor += 1) kinds[cursor] = kind;
      }
      index = end + 1;
      continue;
    }

    if (isRawHtml(line)) {
      kinds[index] = "raw-html";
      const opensMultiline = /<!--|<([A-Za-z][\w:-]*)\b/i.exec(line);
      const tag = opensMultiline?.[1];
      const alreadyClosed = line.includes("-->") || (tag && new RegExp(`</${tag}\\s*>`, "i").test(line));
      if (opensMultiline && !alreadyClosed) {
        for (let cursor = index + 1; cursor < lines.length && lines[cursor].trim(); cursor += 1) {
          kinds[cursor] = "raw-html";
          if (tag && new RegExp(`</${tag}\\s*>`, "i").test(lines[cursor])) break;
          if (!tag && lines[cursor].includes("-->")) break;
        }
      }
      index += 1;
      continue;
    }

    if (/^ {0,3}\[\^?[^\]]+\]:\s/.test(line)) kinds[index] = "reference-definition";
    if (/^ {0,3}:::\s*\S/.test(line)) {
      let end = index;
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        end = cursor;
        if (/^ {0,3}:::\s*(?:\r?\n)?$/.test(lines[cursor])) break;
      }
      for (let cursor = index; cursor <= end; cursor += 1) kinds[cursor] = "container-directive";
      index = end + 1;
      continue;
    }
    index += 1;
  }
  return kinds;
}

export function createRoundTripDocument(source: string): MarkdownRoundTripDocument {
  const lines = sourceLines(source);
  const compatibility = compatibilityLines(lines);
  const segments: MarkdownRoundTripSegment[] = [];
  for (let index = 0; index < lines.length;) {
    const kind = compatibility[index];
    const editable = !kind;
    const start = index;
    while (index < lines.length && (editable ? !compatibility[index] : compatibility[index] === kind)) index += 1;
    segments.push({
      id: `segment-${segments.length}`,
      source: lines.slice(start, index).join(""),
      editable,
      ...(kind ? { compatibilityKind: kind } : {}),
    });
  }
  return {
    original: source,
    segments,
    hasCompatibilityContent: segments.some((segment) => !segment.editable),
  };
}

export function projectRoundTripDocument(model: MarkdownRoundTripDocument): MarkdownRoundTripProjection {
  const anchors: MarkdownCompatibilityAnchor[] = [];
  const source = model.segments.map((segment) => {
    if (segment.editable) return segment.source;
    let token = `TW_COMPATIBILITY_ANCHOR_${segment.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    while (model.original.includes(token)) token += "_";
    anchors.push({
      segmentId: segment.id,
      token: `\`${token}\``,
      compatibilityKind: segment.compatibilityKind ?? "raw-html",
      preview: segment.source.trim().split(/\r?\n/, 1)[0].slice(0, 100),
    });
    return `\`${token}\``;
  }).join("");
  return { source, anchors };
}

export function restoreRoundTripProjection(
  model: MarkdownRoundTripDocument,
  projection: MarkdownRoundTripProjection,
  editedSource: string,
): string {
  let restored = editedSource;
  for (const anchor of projection.anchors) {
    if (!restored.includes(anchor.token)) {
      throw new Error(`Cannot save document because compatibility anchor ${anchor.segmentId} is missing.`);
    }
    const segment = model.segments.find((candidate) => candidate.id === anchor.segmentId);
    if (!segment || segment.editable) throw new Error(`Invalid compatibility anchor ${anchor.segmentId}.`);
    restored = restored.replace(anchor.token, segment.source);
  }
  return restored;
}

export function serializeRoundTripDocument(
  model: MarkdownRoundTripDocument,
  edits: Readonly<Record<string, string>>,
): string {
  return model.segments
    .map((segment) => segment.editable ? edits[segment.id] ?? segment.source : segment.source)
    .join("");
}

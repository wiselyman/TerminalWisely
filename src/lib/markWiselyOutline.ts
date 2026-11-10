export interface MarkdownOutlineHeading {
  index: number;
  level: number;
  text: string;
}

function visibleHeadingText(value: string): string {
  return value
    .replace(/\s+#+\s*$/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*|__|~~|[*_~]/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

export function extractMarkdownHeadings(source: string): MarkdownOutlineHeading[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let start = 0;
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)\s*$/.test(line.trim()));
    if (end >= 0) start = end + 1;
  }

  let fence: { character: string; length: number } | null = null;
  const headings: MarkdownOutlineHeading[] = [];
  for (const line of lines.slice(start)) {
    const fenceLine = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceLine) {
      const marker = fenceLine[1];
      if (!fence) fence = { character: marker[0], length: marker.length };
      else if (marker[0] === fence.character && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;

    const match = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*$/);
    if (!match) continue;
    const text = visibleHeadingText(match[2]);
    if (!text) continue;
    headings.push({ index: headings.length, level: match[1].length, text });
  }
  return headings;
}

export function filterMarkdownHeadings(headings: MarkdownOutlineHeading[], query: string): MarkdownOutlineHeading[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return headings;
  return headings.filter((heading) => heading.text.toLocaleLowerCase().includes(needle));
}

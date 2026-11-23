import { resolveMarkdownImageSrc } from "./markdownImagePath";
import { extractMarkdownHeadings } from "./markWiselyOutline";

export type MarkdownLinkTarget =
  | { kind: "fragment"; fragment: string }
  | { kind: "external"; href: string }
  | { kind: "file"; path: string; fragment: string };

function decodeUrlPath(path: string): string {
  return path
    .split("/")
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .join("/");
}

function decodeFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

export function resolveMarkdownLink(
  markdownPath: string,
  href: string,
): MarkdownLinkTarget | null {
  const value = href.trim();
  if (!value) return null;
  if (value.startsWith("#")) {
    return { kind: "fragment", fragment: decodeFragment(value.slice(1)) };
  }
  if (/^\/\//.test(value)) return { kind: "external", href: `https:${value}` };
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    if (/^(?:https?|mailto):/i.test(value)) return { kind: "external", href: value };
    return null;
  }

  const hashIndex = value.indexOf("#");
  const pathPart = hashIndex < 0 ? value : value.slice(0, hashIndex);
  const fragment = hashIndex < 0 ? "" : decodeFragment(value.slice(hashIndex + 1));
  const resolved = resolveMarkdownImageSrc(markdownPath, pathPart);
  if (!resolved) return null;
  return { kind: "file", path: decodeUrlPath(resolved), fragment };
}

function headingSlug(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}

export function markdownFragmentHeadingIndex(source: string, fragment: string): number {
  const headings = extractMarkdownHeadings(source);
  const used = new Map<string, number>();
  for (const heading of headings) {
    const base = headingSlug(heading.text);
    const duplicateIndex = used.get(base) ?? 0;
    used.set(base, duplicateIndex + 1);
    const slug = duplicateIndex === 0 ? base : `${base}-${duplicateIndex}`;
    if (slug === fragment) return heading.index;
  }
  return -1;
}


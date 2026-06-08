const SHORTCUT_ACCENTS = [
  "#f78166",
  "#ffa657",
  "#e3b341",
  "#3fb950",
  "#58a6ff",
  "#79c0ff",
  "#d2a8ff",
  "#ff7b72",
] as const;

/** Stable accent color per path for compact folder icon markers. */
export function shortcutAccentColor(path: string): string {
  let hash = 0;
  for (let i = 0; i < path.length; i += 1) {
    hash = (hash * 31 + path.charCodeAt(i)) >>> 0;
  }
  return SHORTCUT_ACCENTS[hash % SHORTCUT_ACCENTS.length];
}

/** Last path segment for tab shortcut display (full path stays in tooltip). */
export function shortcutPathLabel(path: string, maxLen = 10): string {
  let p = path.trim();
  if (!p) return "?";
  if (p === "~" || p === "~/") return "~";

  p = p.replace(/[/\\]+$/, "");
  const segments = p.split(/[/\\]/).filter((segment) => segment.length > 0);
  let leaf = segments[segments.length - 1] ?? p;

  if (
    (leaf.startsWith("'") && leaf.endsWith("'")) ||
    (leaf.startsWith('"') && leaf.endsWith('"'))
  ) {
    leaf = leaf.slice(1, -1);
  }

  if (leaf.length > maxLen) {
    return `${leaf.slice(0, maxLen - 1)}…`;
  }
  return leaf;
}

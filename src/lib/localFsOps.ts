/** Pure helpers for Host file-tree ops (DnD / clipboard / multi-select). */

export type FsClipboardOp = "copy" | "cut";

export interface FsClipboard {
  sessionId: string;
  op: FsClipboardOp;
  paths: string[];
}

export function normalizeRemotePath(path: string): string {
  let out = path.trim().replace(/\\/g, "/");
  while (out.includes("//")) out = out.replace("//", "/");
  if (out.length > 1) out = out.replace(/\/+$/, "");
  return out;
}

/** True when candidate is source or nested under source. */
export function isSameOrDescendantPath(source: string, candidate: string): boolean {
  const src = normalizeRemotePath(source);
  const cand = normalizeRemotePath(candidate);
  if (!src || !cand) return false;
  if (cand === src) return true;
  const prefix = src.endsWith("/") ? src : `${src}/`;
  return cand.startsWith(prefix);
}

export function canDropMove(
  draggedPaths: string[],
  destDir: string,
): { ok: boolean; reason?: string } {
  const dest = normalizeRemotePath(destDir);
  if (!dest) return { ok: false, reason: "empty-dest" };
  for (const p of draggedPaths) {
    const src = normalizeRemotePath(p);
    if (!src) return { ok: false, reason: "empty-src" };
    if (isSameOrDescendantPath(src, dest)) {
      return { ok: false, reason: "into-self" };
    }
    const parent = src.includes("/") ? src.slice(0, src.lastIndexOf("/")) || "/" : "/";
    if (normalizeRemotePath(parent) === dest) {
      return { ok: false, reason: "already-there" };
    }
  }
  return { ok: true };
}

/**
 * Resolve DnD destination directory: drop on a folder → that folder;
 * drop on a file → that file's parent (Finder/Explorer style).
 */
export function dropMoveTargetDir(
  entryKind: "directory" | string,
  entryPath: string,
): string {
  const path = normalizeRemotePath(entryPath);
  if (entryKind === "directory") return path;
  return parentRemotePath(path);
}

export function parentRemotePath(path: string): string {
  const n = normalizeRemotePath(path);
  if (!n || n === "/") return "/";
  const idx = n.lastIndexOf("/");
  if (idx <= 0) return "/";
  return n.slice(0, idx) || "/";
}

export function pasteTargetDir(
  selectedPath: string | null,
  selectedKind: "file" | "directory" | null,
  rootPath: string | null,
): string | null {
  if (selectedPath && selectedKind === "directory") return selectedPath;
  if (selectedPath && selectedKind === "file") return parentRemotePath(selectedPath);
  return rootPath;
}

/** Shift-click range selection over ordered visible paths. */
export function rangeSelectPaths(
  orderedPaths: string[],
  anchor: string | null,
  target: string,
  additive: Set<string>,
): string[] {
  if (!anchor) return [...additive, target];
  const a = orderedPaths.indexOf(anchor);
  const b = orderedPaths.indexOf(target);
  if (a < 0 || b < 0) return [...additive, target];
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const slice = orderedPaths.slice(lo, hi + 1);
  const next = new Set(additive);
  for (const p of slice) next.add(p);
  return [...next];
}

export function togglePathInSelection(
  selected: string[],
  path: string,
): string[] {
  if (selected.includes(path)) return selected.filter((p) => p !== path);
  return [...selected, path];
}

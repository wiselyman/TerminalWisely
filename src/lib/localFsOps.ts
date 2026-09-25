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

/**
 * When parent + children are both selected, keep only the outermost roots.
 * (Deleting the parent already removes the children.)
 */
export function collapseToDeleteRoots(paths: string[]): string[] {
  const norm = [
    ...new Set(paths.map(normalizeRemotePath).filter((p) => Boolean(p))),
  ];
  return norm.filter(
    (p) => !norm.some((other) => other !== p && isSameOrDescendantPath(other, p)),
  );
}

/**
 * Drop the open folder from a multi-select that also contains its children.
 * `openDirectory` used to leave `contentsPath` selected; Cmd-clicking files then
 * made Delete wipe the whole browsing directory.
 */
export function sanitizeDeleteSelection(
  paths: string[],
  contentsPath: string | null,
): string[] {
  let list = [
    ...new Set(paths.map(normalizeRemotePath).filter((p) => Boolean(p))),
  ];
  const cwd = contentsPath ? normalizeRemotePath(contentsPath) : null;
  if (
    cwd &&
    list.includes(cwd) &&
    list.some((p) => p !== cwd && isSameOrDescendantPath(cwd, p))
  ) {
    list = list.filter((p) => p !== cwd);
  }
  return collapseToDeleteRoots(list);
}

/** Paths that must never be deleted without an explicit single-target confirm. */
export function isProtectedDeletePath(
  path: string,
  rootPath: string | null = null,
): boolean {
  const n = normalizeRemotePath(path);
  if (!n || n === "/") return true;
  const parts = n.split("/").filter(Boolean);
  if (parts.length <= 1) return true;
  if (rootPath && normalizeRemotePath(rootPath) === n) return true;
  return false;
}

export type PathBreadcrumbSegment = {
  label: string;
  path: string;
};

/** Split `/home/u/docs` into clickable segments including leading `/`. */
export function pathBreadcrumbSegments(
  path: string,
): PathBreadcrumbSegment[] {
  const n = normalizeRemotePath(path);
  if (!n) return [];
  if (n === "/") return [{ label: "/", path: "/" }];
  const parts = n.split("/").filter(Boolean);
  const segments: PathBreadcrumbSegment[] = [{ label: "/", path: "/" }];
  let acc = "";
  for (const part of parts) {
    acc += `/${part}`;
    segments.push({ label: part, path: acc });
  }
  return segments;
}

/** Paths whose grid/list item rects intersect the marquee box (client coords). */
export function pathsIntersectingMarquee(
  items: Array<{
    path: string;
    rect: { left: number; top: number; right: number; bottom: number };
  }>,
  box: { left: number; top: number; right: number; bottom: number },
): string[] {
  const left = Math.min(box.left, box.right);
  const right = Math.max(box.left, box.right);
  const top = Math.min(box.top, box.bottom);
  const bottom = Math.max(box.top, box.bottom);
  return items
    .filter((item) => {
      const r = item.rect;
      return !(
        r.right < left ||
        r.left > right ||
        r.bottom < top ||
        r.top > bottom
      );
    })
    .map((item) => item.path);
}

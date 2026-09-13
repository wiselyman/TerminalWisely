import type { LocalFsEntry } from "../types";

export type LocalFsTreeRow = {
  entry: LocalFsEntry;
  depth: number;
  isExpanded: boolean;
  isLoading: boolean;
  isLoaded: boolean;
};

export type BuildVisibleTreeRowsOptions = {
  /** Finder sidebar: only show directories in the left tree. */
  directoriesOnly?: boolean;
};

export function buildVisibleTreeRows(
  rootPath: string | null,
  childrenCache: Record<string, LocalFsEntry[]>,
  expandedPaths: ReadonlySet<string>,
  loadingPaths: ReadonlySet<string>,
  options: BuildVisibleTreeRowsOptions = {},
): LocalFsTreeRow[] {
  if (!rootPath || !childrenCache[rootPath]) return [];

  const dirsOnly = options.directoriesOnly === true;
  const rows: LocalFsTreeRow[] = [];

  const walk = (path: string, depth: number) => {
    const children = childrenCache[path];
    if (!children) return;

    for (const entry of children) {
      const isDir = entry.kind === "directory";
      if (dirsOnly && !isDir) continue;
      const isExpanded = isDir && expandedPaths.has(entry.path);
      const isLoaded = !isDir || entry.path in childrenCache;
      rows.push({
        entry,
        depth,
        isExpanded,
        isLoading: loadingPaths.has(entry.path),
        isLoaded,
      });
      if (isDir && isExpanded && childrenCache[entry.path]) {
        walk(entry.path, depth + 1);
      }
    }
  };

  walk(rootPath, 0);
  return rows;
}

export function parentRemotePath(path: string): string | null {
  const trimmed = path.replace(/\/+$/, "");
  if (!trimmed || trimmed === "/") return null;
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
}

/** Paths from root down to `path` (inclusive), for expanding the left tree. */
export function directoryAncestorChain(
  rootPath: string,
  path: string,
): string[] {
  const root = rootPath.replace(/\/+$/, "") || "/";
  let cur = path.replace(/\/+$/, "") || "/";
  if (cur === root) return [root];
  if (root !== "/" && !cur.startsWith(`${root}/`) && cur !== root) {
    return [cur];
  }
  const chain: string[] = [];
  while (cur && cur !== "/") {
    chain.push(cur);
    if (cur === root) break;
    const parent = parentRemotePath(cur);
    if (!parent || parent === cur) break;
    cur = parent;
  }
  if (root === "/" && !chain.includes("/")) {
    chain.push("/");
  }
  return chain.reverse();
}

import type { LocalFsEntry } from "../types";

export interface MarkdownWorkspaceDirectory {
  path: string;
  entries: LocalFsEntry[];
}

export interface MarkdownWorkspaceProvider {
  listDirectory(path: string): Promise<MarkdownWorkspaceDirectory>;
  readMarkdown(path: string): Promise<string>;
}

export interface MarkdownWorkspaceSearchProgress {
  phase: "listing" | "searching";
  completed: number;
  total: number | null;
}

export interface MarkdownWorkspaceSearchResult {
  path: string;
  snippet: string;
}

export interface MarkdownWorkspaceSearchSummary {
  results: MarkdownWorkspaceSearchResult[];
  filesScanned: number;
  directoriesScanned: number;
  skippedFiles: number;
}

function normalizePath(path: string): string {
  const slashPath = path.replace(/\\/g, "/");
  if (/^[a-z]:\//i.test(slashPath)) return slashPath.replace(/\/+$/, "").toLowerCase();
  return slashPath.replace(/\/+$/, "") || "/";
}

function isWithinRoot(root: string, candidate: string): boolean {
  const normalizedRoot = normalizePath(root);
  const normalizedPath = normalizePath(candidate);
  if (normalizedPath === normalizedRoot) return true;
  const prefix = normalizedRoot === "/" ? "/" : `${normalizedRoot}/`;
  return normalizedPath.startsWith(prefix);
}

export function isDirectMarkdownWorkspaceChild(directory: string, candidate: string): boolean {
  const normalizedPath = normalizePath(candidate);
  const separator = normalizedPath.lastIndexOf("/");
  const parent = separator <= 0 ? "/" : normalizedPath.slice(0, separator);
  return normalizePath(directory) === normalizePath(parent);
}

function isMarkdown(entry: LocalFsEntry): boolean {
  return entry.kind === "file" && /\.(?:md|markdown)$/i.test(entry.name);
}

export function fuzzyMatchesMarkdownPath(query: string, path: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  let queryIndex = 0;
  for (const character of path.toLocaleLowerCase()) {
    if (character === needle[queryIndex]) queryIndex += 1;
    if (queryIndex === needle.length) return true;
  }
  return false;
}

function visibleEntry(entry: LocalFsEntry): boolean {
  return !entry.name.startsWith(".");
}

function sortEntries(entries: LocalFsEntry[]): LocalFsEntry[] {
  return [...entries].sort((left, right) => {
    const leftRank = left.kind === "directory" ? 0 : isMarkdown(left) ? 1 : 2;
    const rightRank = right.kind === "directory" ? 0 : isMarkdown(right) ? 1 : 2;
    return leftRank - rightRank || left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true });
  });
}

export async function listMarkdownEntries(
  provider: MarkdownWorkspaceProvider,
  directory: string,
): Promise<MarkdownWorkspaceDirectory> {
  const result = await provider.listDirectory(directory);
  return {
    path: result.path,
    entries: sortEntries(result.entries.filter((entry) => isDirectMarkdownWorkspaceChild(result.path, entry.path) && visibleEntry(entry) && (entry.kind === "directory" || isMarkdown(entry)))),
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const error = new Error("Markdown search cancelled.");
  error.name = "AbortError";
  throw error;
}

function excerpt(text: string, start: number, queryLength: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const left = Math.max(0, start - 70);
  const right = Math.min(flat.length, start + queryLength + 110);
  return `${left > 0 ? "…" : ""}${flat.slice(left, right)}${right < flat.length ? "…" : ""}`;
}

export async function searchMarkdownWorkspace(
  provider: MarkdownWorkspaceProvider,
  root: string,
  query: string,
  signal: AbortSignal,
  onProgress?: (progress: MarkdownWorkspaceSearchProgress) => void,
): Promise<MarkdownWorkspaceSearchSummary> {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) throw new Error("Enter text to search for.");
  const normalizedRoot = normalizePath(root);
  const directories = [root];
  const visited = new Set<string>();
  const filePaths = new Set<string>();
  const markdownFiles: LocalFsEntry[] = [];
  let directoriesScanned = 0;

  while (directories.length > 0) {
    throwIfAborted(signal);
    const directory = directories.shift()!;
    const normalizedDirectory = normalizePath(directory);
    if (visited.has(normalizedDirectory)) continue;
    visited.add(normalizedDirectory);
    const listing = await provider.listDirectory(directory);
    throwIfAborted(signal);
    directoriesScanned += 1;
    onProgress?.({ phase: "listing", completed: directoriesScanned, total: null });
    for (const entry of listing.entries) {
      if (!visibleEntry(entry) || !isWithinRoot(normalizedRoot, entry.path)) continue;
      if (entry.kind === "directory") directories.push(entry.path);
      else if (isMarkdown(entry) && !filePaths.has(normalizePath(entry.path))) {
        filePaths.add(normalizePath(entry.path));
        markdownFiles.push(entry);
      }
    }
  }

  markdownFiles.sort((left, right) => left.path.localeCompare(right.path, undefined, { sensitivity: "base", numeric: true }));
  const results: MarkdownWorkspaceSearchResult[] = [];
  let filesScanned = 0;
  let skippedFiles = 0;
  onProgress?.({ phase: "searching", completed: 0, total: markdownFiles.length });
  for (const entry of markdownFiles) {
    throwIfAborted(signal);
    try {
      const content = await provider.readMarkdown(entry.path);
      throwIfAborted(signal);
      const matchIndex = content.toLocaleLowerCase().indexOf(needle);
      if (matchIndex >= 0) results.push({ path: entry.path, snippet: excerpt(content, matchIndex, needle.length) });
      filesScanned += 1;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      skippedFiles += 1;
    }
    onProgress?.({ phase: "searching", completed: filesScanned + skippedFiles, total: markdownFiles.length });
  }
  return { results, filesScanned, directoriesScanned, skippedFiles };
}

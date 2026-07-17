/** True when the path looks like a supported archive for context-menu extract. */
export function isExtractableArchivePath(path: string): boolean {
  const name = path.split(/[/\\]/).pop() ?? path;
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".tar.gz") ||
    lower.endsWith(".tgz") ||
    lower.endsWith(".tar.bz2") ||
    lower.endsWith(".tbz2") ||
    lower.endsWith(".tbz") ||
    lower.endsWith(".tar.xz") ||
    lower.endsWith(".txz") ||
    lower.endsWith(".tar") ||
    lower.endsWith(".zip") ||
    (lower.endsWith(".gz") && !lower.endsWith(".tar.gz"))
  );
}

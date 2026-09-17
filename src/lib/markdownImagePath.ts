/** POSIX-style helpers for remote markdown image paths (no Node `path`). */

export function parentRemoteDir(mdPath: string): string {
  const normalized = mdPath.replace(/\\/g, "/");
  const i = normalized.lastIndexOf("/");
  if (i < 0) return ".";
  if (i === 0) return "/";
  return normalized.slice(0, i);
}

function normalizePosixPath(p: string): string {
  const absolute = p.startsWith("/");
  const parts = p.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (out.length) out.pop();
      continue;
    }
    out.push(part);
  }
  if (absolute) return `/${out.join("/")}`;
  return out.length ? out.join("/") : ".";
}

/**
 * Resolve an image `src` relative to the markdown file path.
 * Returns absolute remote path, or `null` when the src should not be fetched via SSH
 * (http(s), data:, protocol-relative, empty).
 */
export function resolveMarkdownImageSrc(
  mdPath: string,
  src: string,
): string | null {
  const s = src.trim();
  if (!s) return null;
  if (/^(https?:|data:|\/\/)/i.test(s)) return null;
  const posixSrc = s.replace(/\\/g, "/");
  if (posixSrc.startsWith("/")) return normalizePosixPath(posixSrc);
  const base = parentRemoteDir(mdPath);
  const joined =
    base === "/"
      ? `/${posixSrc}`
      : base === "."
        ? posixSrc
        : `${base}/${posixSrc}`;
  return normalizePosixPath(joined);
}

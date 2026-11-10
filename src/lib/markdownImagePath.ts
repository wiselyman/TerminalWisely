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

/** Encode each path segment so spaces and Unicode remain valid Markdown URLs. */
export function markdownImageDestination(relativePath: string): string {
  return relativePath
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/** Place an image beside its Markdown document, preserving Windows or POSIX paths. */
export function joinMarkdownImagePath(mdPath: string, imageName: string): string {
  const separator = mdPath.includes("\\") ? "\\" : "/";
  const normalized = mdPath.replace(/[\\/]/g, separator);
  const index = normalized.lastIndexOf(separator);
  if (index < 0) return imageName;
  if (index === 0) return `${separator}${imageName}`;
  if (separator === "\\" && index === 2 && /^[a-z]:/i.test(normalized)) {
    return `${normalized.slice(0, 3)}${imageName}`;
  }
  return `${normalized.slice(0, index)}${separator}${imageName}`;
}

/** Place a pasted image under an `images` folder beside its Markdown document. */
export function joinMarkdownImagesDirectoryPath(mdPath: string, imageName: string): string {
  return joinMarkdownImagePath(mdPath, `images${mdPath.includes("\\") ? "\\" : "/"}${imageName}`);
}

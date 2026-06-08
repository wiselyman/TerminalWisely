export type PreviewKind =
  | "text"
  | "markdown"
  | "html"
  | "csv"
  | "image"
  | "pdf"
  | "unsupported";

const TEXT_EXTENSIONS = new Set([
  "txt",
  "log",
  "json",
  "yaml",
  "yml",
  "toml",
  "xml",
  "html",
  "htm",
  "css",
  "js",
  "ts",
  "tsx",
  "jsx",
  "rs",
  "py",
  "go",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "sh",
  "bash",
  "zsh",
  "fish",
  "sql",
  "ini",
  "cfg",
  "conf",
  "env",
  "mod",
  "sum",
]);

export const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
]);

export function previewKindFromExtension(
  extension: string,
  totalSize = 0,
): PreviewKind {
  const ext = extension.toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "csv" || ext === "tsv") return "csv";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "html" || ext === "htm") return "html";
  if (TEXT_EXTENSIONS.has(ext)) return "text";
  if (totalSize > 0 && totalSize <= MAX_TEXT_PREVIEW_BYTES) return "text";
  return "unsupported";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

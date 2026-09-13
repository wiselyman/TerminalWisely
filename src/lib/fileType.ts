export type PreviewKind =
  | "text"
  | "markdown"
  | "html"
  | "csv"
  | "image"
  | "pdf"
  | "office"
  | "archive"
  | "video"
  | "audio"
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
  "lock",
  "gitignore",
  "dockerignore",
  "editorconfig",
]);

export const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;

/** Cap for binary materialize (image/pdf/office/archive/media) before download. */
export const MAX_BINARY_PREVIEW_BYTES = 200 * 1024 * 1024;

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

const OFFICE_EXTENSIONS = new Set([
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "odp",
  "rtf",
  "wps",
]);

const ARCHIVE_EXTENSIONS = new Set([
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "xz",
]);

const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "webm",
  "mov",
  "m4v",
  "avi",
  "mkv",
]);

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "ogg",
  "aac",
  "m4a",
  "flac",
]);

/** Basename extension without the dot; empty for extensionless / `.gitignore`-style names. */
export function extensionOfPath(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? path;
  if (!base || base === "." || base === "..") return "";
  // Leading-dot names like `.env` / `.gitignore` → treat as that name's "ext"
  // only when there is another `.` (e.g. `foo.env`); else extensionless.
  if (base.startsWith(".") && base.indexOf(".", 1) < 0) return "";
  const i = base.lastIndexOf(".");
  if (i <= 0 || i === base.length - 1) return "";
  return base.slice(i + 1).toLowerCase();
}

/**
 * Classify preview kind by extension.
 * Unknown extensions are never guessed as text (avoids opening binary `.img` etc.).
 * Extensionless paths may be text when size is unknown or within the text limit
 * (README, Dockerfile, /etc/hosts) — backend still validates content.
 */
export function previewKindFromExtension(
  extension: string,
  totalSize = 0,
): PreviewKind {
  const ext = extension.toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (OFFICE_EXTENSIONS.has(ext)) return "office";
  if (ARCHIVE_EXTENSIONS.has(ext)) return "archive";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (ext === "csv" || ext === "tsv") return "csv";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "html" || ext === "htm") return "html";
  if (TEXT_EXTENSIONS.has(ext)) return "text";
  if (!ext && (totalSize === 0 || totalSize <= MAX_TEXT_PREVIEW_BYTES)) {
    return "text";
  }
  return "unsupported";
}

/** Whether a path should open the preview panel (matches Send-to-chat whitelist spirit). */
export function canPreviewPath(
  path: string,
  totalSize?: number | null,
): boolean {
  const size =
    totalSize != null && Number.isFinite(totalSize) ? Number(totalSize) : 0;
  return previewKindFromExtension(extensionOfPath(path), size) !== "unsupported";
}

export function isReadonlyBinaryPreviewKind(kind: string): boolean {
  return (
    kind === "image" ||
    kind === "pdf" ||
    kind === "office" ||
    kind === "archive" ||
    kind === "video" ||
    kind === "audio"
  );
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

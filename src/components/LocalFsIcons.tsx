import type { LocalEntryKind } from "../types";

const entryIconProps = {
  width: 18,
  height: 18,
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

const toolIconProps = {
  width: 15,
  height: 15,
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "ico",
  "bmp",
  "heic",
  "avif",
]);

const ARCHIVE_EXTS = new Set([
  "zip",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "rar",
  "7z",
  "deb",
  "rpm",
]);

const SHELL_EXTS = new Set([
  "sh",
  "bash",
  "zsh",
  "fish",
  "csh",
  "ksh",
  "ps1",
  "bat",
  "cmd",
]);

const CODE_EXTS = new Set([
  "py",
  "rs",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "go",
  "c",
  "cc",
  "cpp",
  "cxx",
  "h",
  "hpp",
  "java",
  "kt",
  "swift",
  "rb",
  "php",
  "lua",
  "r",
  "scala",
  "cs",
  "vue",
  "svelte",
]);

const CONFIG_EXTS = new Set([
  "json",
  "yaml",
  "yml",
  "toml",
  "ini",
  "conf",
  "cfg",
  "env",
  "properties",
  "xml",
]);

const TEXT_EXTS = new Set([
  "md",
  "markdown",
  "txt",
  "rst",
  "csv",
  "tsv",
  "log",
]);

function fileExt(name: string): string | null {
  const idx = name.lastIndexOf(".");
  if (idx <= 0 || idx === name.length - 1) return null;
  return name.slice(idx + 1).toLowerCase();
}

export function LocalFsFolderIcon() {
  return (
    <svg viewBox="0 0 24 24" {...entryIconProps} className="local-fs-entry-icon is-folder">
      <path
        d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function LocalFsFileIcon() {
  return (
    <svg viewBox="0 0 24 24" {...entryIconProps} className="local-fs-entry-icon is-file">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
}

export function LocalFsImageIcon() {
  return (
    <svg viewBox="0 0 24 24" {...entryIconProps} className="local-fs-entry-icon is-image">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <circle cx="9" cy="9" r="2" fill="currentColor" stroke="none" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

export function LocalFsArchiveIcon() {
  return (
    <svg viewBox="0 0 24 24" {...entryIconProps} className="local-fs-entry-icon is-archive">
      <path d="M10 2v4h4V2" />
      <path d="M8 6h8v4H8z" />
      <path d="M8 10h8v12H8z" />
      <path d="M11 14h2" />
    </svg>
  );
}

function LocalFsShellIcon() {
  return (
    <svg viewBox="0 0 24 24" {...entryIconProps} className="local-fs-entry-icon is-shell">
      <rect width="18" height="14" x="3" y="5" rx="2" />
      <path d="m7 10 2.5 2.5L7 15" />
      <path d="M12 15h5" />
    </svg>
  );
}

function LocalFsCodeIcon() {
  return (
    <svg viewBox="0 0 24 24" {...entryIconProps} className="local-fs-entry-icon is-code">
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
    </svg>
  );
}

function LocalFsConfigIcon() {
  return (
    <svg viewBox="0 0 24 24" {...entryIconProps} className="local-fs-entry-icon is-config">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function LocalFsTextIcon() {
  return (
    <svg viewBox="0 0 24 24" {...entryIconProps} className="local-fs-entry-icon is-text">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M8 13h8M8 17h6M8 9h2" />
    </svg>
  );
}

function LocalFsLogIcon() {
  return (
    <svg viewBox="0 0 24 24" {...entryIconProps} className="local-fs-entry-icon is-log">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M8 12h8M8 16h5" />
    </svg>
  );
}

export function LocalFsEntryIcon({
  kind,
  name,
}: {
  kind: LocalEntryKind;
  name: string;
}) {
  // Folders use chevron-only expand/collapse — no yellow folder glyph.
  if (kind === "directory") return null;
  const ext = fileExt(name);
  if (!ext) return <LocalFsFileIcon />;
  if (IMAGE_EXTS.has(ext)) return <LocalFsImageIcon />;
  if (ARCHIVE_EXTS.has(ext)) return <LocalFsArchiveIcon />;
  if (SHELL_EXTS.has(ext)) return <LocalFsShellIcon />;
  if (ext === "log") return <LocalFsLogIcon />;
  if (CODE_EXTS.has(ext)) return <LocalFsCodeIcon />;
  if (CONFIG_EXTS.has(ext)) return <LocalFsConfigIcon />;
  if (TEXT_EXTS.has(ext)) return <LocalFsTextIcon />;
  return <LocalFsFileIcon />;
}

export function LocalFsChevronUpIcon() {
  return (
    <svg viewBox="0 0 24 24" {...toolIconProps}>
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

export function LocalFsHomeIcon() {
  return (
    <svg viewBox="0 0 24 24" {...toolIconProps}>
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export function LocalFsRefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" {...toolIconProps}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

/** Jump to terminal cwd — Lucide locate-fixed. */
export function LocalFsCwdIcon() {
  return (
    <svg viewBox="0 0 24 24" {...toolIconProps}>
      <line x1="2" x2="5" y1="12" y2="12" />
      <line x1="19" x2="22" y1="12" y2="12" />
      <line x1="12" x2="12" y1="2" y2="5" />
      <line x1="12" x2="12" y1="19" y2="22" />
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function LocalFsHiddenIcon({ show }: { show?: boolean }) {
  if (show) {
    return (
      <svg viewBox="0 0 24 24" {...toolIconProps}>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" {...toolIconProps}>
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499A10.785 10.785 0 0 1 12 19c-6.5 0-10-7-10-7a15.355 15.355 0 0 1 3.041-3.818" />
      <path d="m2 2 20 20" />
    </svg>
  );
}

export function LocalFsSettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" {...toolIconProps}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function LocalFsChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" {...toolIconProps} className="local-fs-crumb-sep-icon">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/** Tree expand/collapse chevron */
export function LocalFsTreeChevronIcon({ expanded }: { expanded?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`local-fs-tree-chevron${expanded ? " is-expanded" : ""}`}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

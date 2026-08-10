/**
 * Icons copied verbatim from Lucide v1.23.0 (ISC): https://lucide.dev/icons
 * Source: lucide-static package — paste SVG children only, do not hand-draw.
 */

const iconProps = {
  width: 18,
  height: 18,
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

/** lucide: cpu — 进程管理 */
export function TaskManagerIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <path d="M12 20v2" />
      <path d="M12 2v2" />
      <path d="M17 20v2" />
      <path d="M17 2v2" />
      <path d="M2 12h2" />
      <path d="M2 17h2" />
      <path d="M2 7h2" />
      <path d="M20 12h2" />
      <path d="M20 17h2" />
      <path d="M20 7h2" />
      <path d="M7 20v2" />
      <path d="M7 2v2" />
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
    </svg>
  );
}

/** lucide: file-search — 在文件中查找 */
export function FindInFilesIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      <circle cx="11.5" cy="14.5" r="2.5" />
      <path d="M13.3 16.3 15 18" />
    </svg>
  );
}

/** lucide: server — 系统信息 */
export function SystemInfoIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
      <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
      <line x1="6" x2="6.01" y1="6" y2="6" />
      <line x1="6" x2="6.01" y1="18" y2="18" />
    </svg>
  );
}

/** lucide: square-terminal — 命令行向导 */
export function CommandNavigatorIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <path d="m7 11 2-2-2-2" />
      <path d="M11 13h4" />
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    </svg>
  );
}

/** lucide: bot — AI Linux Engineer */
export function AiEngineerIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

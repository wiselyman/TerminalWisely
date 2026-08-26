/**
 * Icons for workspace chrome. Paths from Lucide Static v0.468.0 (ISC) unless noted.
 * Stroke kept at 1.5 for a finer Cursor-like weight (Lucide default is 2).
 */

const iconProps = {
  width: 16,
  height: 16,
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

/** lucide: table-properties — 任务/进程表 */
export function TaskManagerIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <path d="M15 3v18" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M21 9H3" />
      <path d="M21 15H3" />
    </svg>
  );
}

/** lucide: search — 查找 */
export function FindInFilesIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

/** lucide: server — 服务器资源 */
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

/** lucide: book-open — 命令导航（手册/向导，非终端） */
export function CommandNavigatorIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </svg>
  );
}

/** lucide: message-square — AI Agent */
export function AiEngineerIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/** lucide: folder — local files */
export function LocalFilesIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

/** lucide: monitor — host workspace / this computer */
export function HostWorkspaceIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M12 16v4" />
      <path d="M8 20h8" />
    </svg>
  );
}

/** lucide: plus — 新对话 */
export function NewChatIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

/** lucide: history — 历史会话 */
export function ChatHistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

/**
 * Cursor-style left sidebar toggle (fig.3): frame + filled left rail.
 * Not a Lucide paste — matches Cursor’s panel affordance.
 */
export function PanelLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <rect
        width="5"
        height="14"
        x="5.5"
        y="5"
        rx="0.5"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/** lucide: panel-right — 右侧面板收起（Cursor 同形） */
export function PanelRightIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M15 3v18" />
    </svg>
  );
}

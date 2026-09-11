export function TabFolderIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 4.25h4.25L7.75 6h6v7.25H2.5V4.25z" />
    </svg>
  );
}

/** lucide: home — same 16/1.5 weight as SidebarToggleIcon */
export function TabHomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

/** Cursor-style left sidebar toggle (title bar). */
export function SidebarToggleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
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

/** lucide: plus */
export function ChromePlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

export function SshConnectIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.25" y="2.75" width="9.5" height="10.5" rx="1.25" />
      <path d="M3.25 5.75h9.5M3.25 8h9.5M3.25 10.25h9.5" />
      <circle cx="5.35" cy="4.25" r="0.65" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BookmarkIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 2.75h9v10.75L8 11.5 3.5 13.5V2.75z" />
    </svg>
  );
}

export type SidebarActionKind = "ssh" | "bookmark";

interface SidebarActionIconProps {
  kind: SidebarActionKind;
  label: string;
}

export function SidebarActionIcon({ kind, label }: SidebarActionIconProps) {
  return (
    <span
      className={`sidebar-action-icon sidebar-action-icon-${kind}`}
      aria-label={label}
      title={label}
    >
      {kind === "ssh" && <SshConnectIcon />}
      {kind === "bookmark" && <BookmarkIcon />}
    </span>
  );
}

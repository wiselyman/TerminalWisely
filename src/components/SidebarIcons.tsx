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

export function TabHomeIcon() {
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
      <path d="M8 3 3.75 6.25V12.5H6.5V9.25h3V12.5h2.75V6.25L8 3z" />
    </svg>
  );
}

export function LocalTerminalIcon() {
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
      <path d="M8 3 3.75 6.25V12.5H6.5V9.25h3V12.5h2.75V6.25L8 3z" />
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

interface SidebarActionIconProps {
  kind: "local" | "ssh" | "bookmark";
  label: string;
}

export function SidebarActionIcon({ kind, label }: SidebarActionIconProps) {
  return (
    <span
      className={`sidebar-action-icon sidebar-action-icon-${kind}`}
      aria-label={label}
      title={label}
    >
      {kind === "local" && <LocalTerminalIcon />}
      {kind === "ssh" && <SshConnectIcon />}
      {kind === "bookmark" && <BookmarkIcon />}
    </span>
  );
}

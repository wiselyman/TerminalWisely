import { WorkspaceToolButton } from "./WorkspaceToolRail";

function CommandNavigatorIcon() {
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
      <path d="M3 4.5h10M3 8h7M3 11.5h10" />
      <path d="M12.5 7.25 14 8.75l-1.5 1.5" />
    </svg>
  );
}

interface CommandNavigatorToolProps {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function CommandNavigatorTool({
  active,
  disabled,
  onClick,
}: CommandNavigatorToolProps) {
  return (
    <WorkspaceToolButton
      label="命令"
      active={active}
      disabled={disabled}
      onClick={onClick}
    >
      <CommandNavigatorIcon />
    </WorkspaceToolButton>
  );
}

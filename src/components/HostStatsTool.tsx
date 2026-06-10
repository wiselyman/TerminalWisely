import { HostStatsIcon } from "./SidebarIcons";
import { WorkspaceToolButton } from "./WorkspaceToolRail";

interface HostStatsToolProps {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function HostStatsTool({ active, disabled, onClick }: HostStatsToolProps) {
  return (
    <WorkspaceToolButton
      label="服务器资源"
      active={active}
      disabled={disabled}
      onClick={onClick}
    >
      <HostStatsIcon />
    </WorkspaceToolButton>
  );
}

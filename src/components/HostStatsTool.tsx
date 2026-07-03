import { SystemInfoIcon } from "./WorkspaceToolIcons";
import { WorkspaceToolButton } from "./WorkspaceToolRail";

interface HostStatsToolProps {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function HostStatsTool({ active, disabled, onClick }: HostStatsToolProps) {
  return (
    <WorkspaceToolButton
      label="系统信息"
      active={active}
      disabled={disabled}
      onClick={onClick}
    >
      <SystemInfoIcon />
    </WorkspaceToolButton>
  );
}

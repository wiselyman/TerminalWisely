import { FindIcon } from "./SidebarIcons";
import { WorkspaceToolButton } from "./WorkspaceToolRail";

interface FindToolProps {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function FindTool({ active, disabled, onClick }: FindToolProps) {
  return (
    <WorkspaceToolButton
      label="Find"
      active={active}
      disabled={disabled}
      onClick={onClick}
    >
      <FindIcon />
    </WorkspaceToolButton>
  );
}

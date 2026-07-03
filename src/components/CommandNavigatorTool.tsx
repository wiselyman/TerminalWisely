import { CommandNavigatorIcon } from "./WorkspaceToolIcons";
import { WorkspaceToolButton } from "./WorkspaceToolRail";

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
      label="命令行向导"
      active={active}
      disabled={disabled}
      onClick={onClick}
    >
      <CommandNavigatorIcon />
    </WorkspaceToolButton>
  );
}

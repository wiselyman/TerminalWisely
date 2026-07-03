import { TaskManagerIcon } from "./WorkspaceToolIcons";
import { WorkspaceToolButton } from "./WorkspaceToolRail";

interface TaskManagerToolProps {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function TaskManagerTool({
  active,
  disabled,
  onClick,
}: TaskManagerToolProps) {
  return (
    <WorkspaceToolButton
      label="进程管理"
      active={active}
      disabled={disabled}
      onClick={onClick}
    >
      <TaskManagerIcon />
    </WorkspaceToolButton>
  );
}

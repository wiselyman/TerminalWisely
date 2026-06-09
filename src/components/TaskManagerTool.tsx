import { TaskManagerIcon } from "./SidebarIcons";
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
      label="任务管理器"
      active={active}
      disabled={disabled}
      onClick={onClick}
    >
      <TaskManagerIcon />
    </WorkspaceToolButton>
  );
}

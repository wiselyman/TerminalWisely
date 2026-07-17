import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("tools");
  return (
    <WorkspaceToolButton
      label={t("taskManager.railLabel")}
      active={active}
      disabled={disabled}
      onClick={onClick}
    >
      <TaskManagerIcon />
    </WorkspaceToolButton>
  );
}

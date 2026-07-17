import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("tools");
  return (
    <WorkspaceToolButton
      label={t("commandNav.railLabel")}
      active={active}
      disabled={disabled}
      onClick={onClick}
    >
      <CommandNavigatorIcon />
    </WorkspaceToolButton>
  );
}

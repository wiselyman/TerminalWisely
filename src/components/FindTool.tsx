import { useTranslation } from "react-i18next";
import { FindInFilesIcon } from "./WorkspaceToolIcons";
import { WorkspaceToolButton } from "./WorkspaceToolRail";

interface FindToolProps {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function FindTool({ active, disabled, onClick }: FindToolProps) {
  const { t } = useTranslation("tools");
  return (
    <WorkspaceToolButton
      label={t("find.railLabel")}
      active={active}
      disabled={disabled}
      onClick={onClick}
    >
      <FindInFilesIcon />
    </WorkspaceToolButton>
  );
}

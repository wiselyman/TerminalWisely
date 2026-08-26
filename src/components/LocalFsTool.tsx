import { useTranslation } from "react-i18next";
import { HostWorkspaceIcon } from "./WorkspaceToolIcons";
import { WorkspaceToolButton } from "./WorkspaceToolRail";

interface LocalFsToolProps {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function LocalFsTool({ active, disabled, onClick }: LocalFsToolProps) {
  const { t } = useTranslation("tools");
  return (
    <WorkspaceToolButton
      label={t("localFs.railLabel")}
      active={active}
      disabled={disabled}
      onClick={onClick}
    >
      <HostWorkspaceIcon />
    </WorkspaceToolButton>
  );
}

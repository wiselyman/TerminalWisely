import { useTranslation } from "react-i18next";
import { SystemInfoIcon } from "./WorkspaceToolIcons";
import { WorkspaceToolButton } from "./WorkspaceToolRail";

interface HostStatsToolProps {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function HostStatsTool({ active, disabled, onClick }: HostStatsToolProps) {
  const { t } = useTranslation("tools");
  return (
    <WorkspaceToolButton
      label={t("hostStats.railLabel")}
      active={active}
      disabled={disabled}
      onClick={onClick}
    >
      <SystemInfoIcon />
    </WorkspaceToolButton>
  );
}

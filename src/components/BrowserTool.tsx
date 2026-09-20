import { useTranslation } from "react-i18next";
import { HostBrowserIcon } from "./WorkspaceToolIcons";
import { WorkspaceToolButton } from "./WorkspaceToolRail";

interface BrowserToolProps {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function BrowserTool({ active, disabled, onClick }: BrowserToolProps) {
  const { t } = useTranslation("tools");
  return (
    <WorkspaceToolButton
      label={disabled ? t("browser.disabledNeedSsh") : t("browser.railLabel")}
      active={active}
      disabled={disabled}
      testId="host-browser-tool"
      onClick={onClick}
    >
      <HostBrowserIcon />
    </WorkspaceToolButton>
  );
}

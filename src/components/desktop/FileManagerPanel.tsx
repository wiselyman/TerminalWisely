import { useTranslation } from "react-i18next";
import { LocalFsPanel } from "../LocalFsPanel";
import { DesktopAppWindow } from "./DesktopAppWindow";

type Props = {
  sessionId: string;
  sessionTitle?: string | null;
};

export function FileManagerPanel({ sessionId, sessionTitle }: Props) {
  const { t } = useTranslation("tools");

  return (
    <DesktopAppWindow
      appId="files"
      title={t("desktop.appFiles")}
      subtitle={sessionTitle}
      panelTestId="host-file-manager-panel"
      floatTestId="host-file-manager-float"
      minimizeTestId="host-file-manager-minimize"
      maximizeTestId="host-file-manager-maximize"
      closeTestId="host-file-manager-close"
      bodyClassName="local-fs-float-body"
    >
      <LocalFsPanel
        sessionId={sessionId}
        sessionTitle={sessionTitle}
        presentation="embedded"
      />
    </DesktopAppWindow>
  );
}

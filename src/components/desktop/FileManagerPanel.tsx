import { useTranslation } from "react-i18next";
import { LocalFsPanel } from "../LocalFsPanel";
import { DesktopAppWindow } from "./DesktopAppWindow";
import { LocalDesktopFileManager } from "./LocalDesktopFileManager";
import type { DesktopTarget } from "../../lib/desktopTarget";

type Props = {
  target: DesktopTarget;
  sessionId?: string;
  sessionTitle?: string | null;
};

export function FileManagerPanel({ target, sessionId, sessionTitle }: Props) {
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
      {target.kind === "local" ? <LocalDesktopFileManager /> : sessionId ? (
        <LocalFsPanel
          sessionId={sessionId}
          sessionTitle={sessionTitle}
          presentation="embedded"
        />
      ) : null}
    </DesktopAppWindow>
  );
}

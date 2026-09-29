import { useTranslation } from "react-i18next";
import { setDesktopSurfaceHost } from "../../lib/desktopSurfaceHost";
import { WorkspacePanelHeadActions } from "../WorkspacePanelHeadActions";
import { DesktopClock, DesktopDock } from "./DesktopDock";
import { DesktopIcons } from "./DesktopIcons";

type Props = {
  sessionId: string;
  sessionTitle?: string | null;
};

export function DesktopPanel({ sessionId, sessionTitle }: Props) {
  const { t } = useTranslation("tools");
  const bindSurface = (el: HTMLDivElement | null) => {
    setDesktopSurfaceHost(el);
  };

  return (
    <aside
      className="host-desktop-panel local-fs-panel find-panel open"
      aria-label={t("desktop.panelAria")}
      data-testid="host-desktop-panel"
    >
      <div className="host-desktop-stage">
        <div className="host-desktop-menubar">
          <h2 className="host-desktop-computer" title={sessionTitle ?? t("desktop.title")}>
            {sessionTitle || t("desktop.title")}
          </h2>
          <DesktopClock />
          <WorkspacePanelHeadActions panelId="desktop" sessionId={sessionId} />
        </div>
        <div
          ref={bindSurface}
          className="host-desktop-surface"
          data-testid="host-desktop-surface"
        >
          <DesktopIcons />
        </div>
        <DesktopDock />
      </div>
    </aside>
  );
}

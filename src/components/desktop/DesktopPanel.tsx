import { type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { setDesktopSurfaceHost } from "../../lib/desktopSurfaceHost";
import { clampWorkspacePanelWidth } from "../../lib/workspacePanelWidth";
import { useWorkspacePanelEnter } from "../../lib/useWorkspacePanelEnter";
import { useDesktopStore } from "../../stores/desktopStore";
import { WorkspacePanelBackdrop } from "../WorkspacePanelBackdrop";
import { WorkspacePanelHeadActions } from "../WorkspacePanelHeadActions";
import { DesktopClock, DesktopDock } from "./DesktopDock";
import { DesktopIcons } from "./DesktopIcons";

type Props = {
  sessionId: string;
  sessionTitle?: string | null;
};

export function DesktopPanel({ sessionId, sessionTitle }: Props) {
  const { t } = useTranslation("tools");
  const panelRef = useWorkspacePanelEnter<HTMLElement>();
  const width = useDesktopStore((s) => s.width);
  const setWidth = useDesktopStore((s) => s.setWidth);
  const bindSurface = (el: HTMLDivElement | null) => {
    setDesktopSurfaceHost(el);
  };

  const startResize = (event: ReactMouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startW = width;
    let latest = startW;
    document.body.classList.add("find-panel-resizing");
    const onMove = (ev: MouseEvent) => {
      latest = clampWorkspacePanelWidth(startW - (ev.clientX - startX));
      setWidth(latest);
    };
    const onUp = () => {
      document.body.classList.remove("find-panel-resizing");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setWidth(latest);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <>
      <WorkspacePanelBackdrop panelId="desktop" />
      <aside
        ref={panelRef}
        className="host-desktop-panel local-fs-panel find-panel open"
        style={{ width }}
        aria-label={t("desktop.panelAria")}
        data-testid="host-desktop-panel"
      >
        <div
          className="find-panel-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("desktop.resizeAria")}
          onMouseDown={startResize}
        />
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
    </>
  );
}

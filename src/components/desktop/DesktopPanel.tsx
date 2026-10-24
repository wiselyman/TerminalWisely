import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { setDesktopSurfaceHost } from "../../lib/desktopSurfaceHost";
import { useDesktopStore } from "../../stores/desktopStore";
import { WorkspacePanelHeadActions } from "../WorkspacePanelHeadActions";
import { DesktopClock, DesktopDock } from "./DesktopDock";
import { DesktopIcons } from "./DesktopIcons";

type Props = {
  sessionId: string;
  sessionTitle?: string | null;
};

export function DesktopPanel({ sessionId, sessionTitle }: Props) {
  const { t } = useTranslation("tools");
  const hasMaximizedApp = useDesktopStore((s) =>
    Object.values(s.apps).some((app) => app.open && !app.minimized && app.maximized),
  );
  const [dockRevealed, setDockRevealed] = useState(false);
  const hideDockTimer = useRef<number | null>(null);
  const bindSurface = (el: HTMLDivElement | null) => {
    setDesktopSurfaceHost(el);
  };

  const cancelDockHide = () => {
    if (hideDockTimer.current !== null) {
      window.clearTimeout(hideDockTimer.current);
      hideDockTimer.current = null;
    }
  };
  const revealDock = () => {
    cancelDockHide();
    setDockRevealed(true);
  };
  const scheduleDockHide = () => {
    cancelDockHide();
    hideDockTimer.current = window.setTimeout(() => {
      hideDockTimer.current = null;
      const dock = document.querySelector(".host-desktop-dock");
      if (
        dock &&
        document.activeElement instanceof Node &&
        dock.contains(document.activeElement)
      ) {
        return;
      }
      setDockRevealed(false);
    }, 450);
  };

  useEffect(() => {
    cancelDockHide();
    setDockRevealed(false);
    return cancelDockHide;
  }, [hasMaximizedApp]);

  return (
    <aside
      className="host-desktop-panel local-fs-panel find-panel open"
      aria-label={t("desktop.panelAria")}
      data-testid="host-desktop-panel"
    >
      <div
        className={`host-desktop-stage${hasMaximizedApp ? " has-maximized-app" : ""}`}
        data-maximized-app={hasMaximizedApp ? "true" : "false"}
      >
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
        {hasMaximizedApp ? (
          <div
            className="host-desktop-dock-reveal-zone"
            data-testid="host-desktop-dock-reveal-zone"
            aria-hidden="true"
            onPointerEnter={revealDock}
            onPointerLeave={scheduleDockHide}
          />
        ) : null}
        <DesktopDock
          visible={!hasMaximizedApp || dockRevealed}
          onPointerEnter={revealDock}
          onPointerLeave={scheduleDockHide}
          onFocus={revealDock}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              scheduleDockHide();
            }
          }}
        />
      </div>
    </aside>
  );
}

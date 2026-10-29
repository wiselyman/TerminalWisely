import {
  useLayoutEffect,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  getDesktopSurfaceHost,
  subscribeDesktopSurfaceHost,
} from "../../lib/desktopSurfaceHost";
import {
  getDesktopChromeHost,
  subscribeDesktopChromeHost,
} from "../../lib/desktopChromeHost";
import {
  centerDesktopFrame,
  DESKTOP_RESIZE_EDGES,
  moveDesktopFrame,
  resizeDesktopFrame,
  type DesktopResizeEdge,
  type DesktopWindowFrame,
} from "../../lib/desktopWindowFrame";
import {
  useDesktopStore,
  type DesktopAppId,
} from "../../stores/desktopStore";
import {
  PreviewCloseIcon,
  PreviewMaximizeIcon,
  PreviewMinimizeIcon,
  PreviewRestoreIcon,
} from "../PreviewIcons";
import { DESKTOP_APPS } from "./desktopApps";
import { desktopAppFloatZ } from "../../lib/floatStacking";

type Props = {
  appId: DesktopAppId;
  title: string;
  centerTitle?: ReactNode;
  subtitle?: string | null;
  /** Optional leading mark (e.g. Host Browser globe). */
  leading?: ReactNode;
  /** Hide title/subtitle text; aria-label still uses `title`. */
  hideTitleText?: boolean;
  panelTestId: string;
  floatTestId: string;
  minimizeTestId: string;
  maximizeTestId: string;
  closeTestId: string;
  bodyClassName?: string;
  onCloseRequest?: () => boolean | Promise<boolean>;
  children: ReactNode;
};

function surfaceBounds(surface: HTMLElement) {
  const rect = surface.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

export function DesktopAppWindow({
  appId,
  title,
  centerTitle,
  leading,
  panelTestId,
  floatTestId,
  minimizeTestId,
  maximizeTestId,
  closeTestId,
  bodyClassName,
  onCloseRequest,
  children,
}: Props) {
  const { t } = useTranslation(["tools", "common"]);
  const win = useDesktopStore((s) => s.apps[appId]);
  const frame = useDesktopStore((s) => s.frames[appId]);
  const zIndex = useDesktopStore((s) => s.zIndexFor(appId));
  const minimizeApp = useDesktopStore((s) => s.minimizeApp);
  const closeApp = useDesktopStore((s) => s.closeApp);
  const setAppMaximized = useDesktopStore((s) => s.setAppMaximized);
  const setAppFrame = useDesktopStore((s) => s.setAppFrame);
  const focusApp = useDesktopStore((s) => s.focusApp);
  const surface = useSyncExternalStore(
    subscribeDesktopSurfaceHost,
    getDesktopSurfaceHost,
    getDesktopSurfaceHost,
  );
  const chromeHost = useSyncExternalStore(
    subscribeDesktopChromeHost,
    getDesktopChromeHost,
    getDesktopChromeHost,
  );

  useLayoutEffect(() => {
    if (!surface || !win.open || win.minimized || win.maximized || frame) return;
    const bounds = surfaceBounds(surface);
    if (bounds.width < 32 || bounds.height < 32) return;
    setAppFrame(appId, centerDesktopFrame(bounds));
  }, [
    appId,
    frame,
    setAppFrame,
    surface,
    win.maximized,
    win.minimized,
    win.open,
  ]);

  if (!win.open || win.minimized || !surface) return null;

  const maximized = win.maximized;
  const liveFrame: DesktopWindowFrame | null = maximized
    ? null
    : frame ??
      (() => {
        const bounds = surfaceBounds(surface);
        if (bounds.width < 32 || bounds.height < 32) return null;
        return centerDesktopFrame(bounds);
      })();
  if (!maximized && !liveFrame) return null;

  const AppIcon = DESKTOP_APPS.find((app) => app.id === appId)?.icon;
  const mark = leading ?? (AppIcon ? <AppIcon /> : null);
  const header = (
    <header
      className={`preview-panel-head desktop-app-window-head is-compact${
        maximized ? " is-maximized" : ""
      }${centerTitle ? " has-centered-title" : ""}`}
      onPointerDown={onDragStart}
    >
      {mark ? (
        <span
          className="desktop-app-window-leading"
          data-testid="desktop-app-window-leading"
          aria-hidden
        >
          {mark}
        </span>
      ) : null}
      {maximized ? (
        <span
          className="desktop-app-window-maximized-title"
          data-testid="desktop-app-window-title"
        >
          {title}
        </span>
      ) : (
        <div className="desktop-app-window-title-wrap is-spacer" aria-hidden />
      )}
      {centerTitle ? (
        <div className="desktop-app-window-centered-title">{centerTitle}</div>
      ) : null}
      <div className="preview-panel-actions desktop-app-window-actions">
        <button
          type="button"
          className="preview-toolbar-icon"
          data-testid={minimizeTestId}
          title={t("desktop.minimizeToDock")}
          aria-label={t("common:minimize")}
          onClick={() => minimizeApp(appId)}
        >
          <PreviewMinimizeIcon />
        </button>
        <button
          type="button"
          className="preview-toolbar-icon"
          data-testid={maximizeTestId}
          title={t(maximized ? "desktop.restore" : "desktop.maximize")}
          aria-label={t(maximized ? "desktop.restore" : "desktop.maximize")}
          onClick={() => setAppMaximized(appId, !maximized)}
        >
          {maximized ? <PreviewRestoreIcon /> : <PreviewMaximizeIcon />}
        </button>
        <button
          type="button"
          className="preview-toolbar-icon"
          data-testid={closeTestId}
          title={t("common:close")}
          aria-label={t("common:close")}
          onClick={async () => {
            if (onCloseRequest && !(await onCloseRequest())) return;
            closeApp(appId);
          }}
        >
          <PreviewCloseIcon />
        </button>
      </div>
    </header>
  );

  const trackPointer = (
    event: ReactPointerEvent,
    onMove: (dx: number, dy: number, bounds: { width: number; height: number }) => void,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    focusApp(appId);
    const originX = event.clientX;
    const originY = event.clientY;
    const move = (ev: PointerEvent) => {
      onMove(ev.clientX - originX, ev.clientY - originY, surfaceBounds(surface));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  function onDragStart(event: ReactPointerEvent) {
    if (maximized || !liveFrame) return;
    if ((event.target as HTMLElement).closest("button")) return;
    const start = liveFrame;
    trackPointer(event, (dx, dy, bounds) => {
      setAppFrame(appId, moveDesktopFrame(start, dx, dy, bounds));
    });
  }

  const onResizeStart = (edge: DesktopResizeEdge, event: ReactPointerEvent) => {
    if (maximized || !liveFrame) return;
    const start = liveFrame;
    trackPointer(event, (dx, dy, bounds) => {
      setAppFrame(appId, resizeDesktopFrame(start, edge, dx, dy, bounds));
    });
  };

  return (
    <>
      {createPortal(
        <div
          className={`desktop-app-float${maximized ? " is-maximized" : ""}`}
          data-testid={floatTestId}
          style={
            maximized || !liveFrame
              ? { zIndex: desktopAppFloatZ(zIndex) }
              : {
                  zIndex: desktopAppFloatZ(zIndex),
                  left: liveFrame.x,
                  top: liveFrame.y,
                  width: liveFrame.width,
                  height: liveFrame.height,
                }
          }
          onMouseDown={() => focusApp(appId)}
        >
          <div
            className={`preview-float-window desktop-app-window${
              maximized ? " maximized" : ""
            }`}
            role="dialog"
            aria-label={title}
            data-testid={panelTestId}
            data-maximized={maximized ? "true" : "false"}
            data-chrome={maximized ? "promoted-titlebar" : "icon-title"}
          >
            {maximized ? null : header}
            <div
              className={`desktop-app-window-body ${bodyClassName ?? ""}`.trim()}
            >
              {children}
            </div>
          </div>
          {maximized
            ? null
            : DESKTOP_RESIZE_EDGES.map((edge) => (
                <div
                  key={edge}
                  className={`desktop-app-resize desktop-app-resize-${edge}`}
                  data-testid={`desktop-window-resize-${edge}`}
                  onPointerDown={(event) => onResizeStart(edge, event)}
                />
              ))}
        </div>,
        surface,
      )}
      {maximized && chromeHost
        ? createPortal(
            <div
              className="chrome-maximized-app-controls"
              data-testid="desktop-maximized-app-controls"
              data-tauri-drag-region=""
            >
              {header}
            </div>,
            chromeHost,
          )
        : null}
    </>
  );
}

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
  children: ReactNode;
};

function surfaceBounds(surface: HTMLElement) {
  const rect = surface.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

export function DesktopAppWindow({
  appId,
  title,
  leading,
  panelTestId,
  floatTestId,
  minimizeTestId,
  maximizeTestId,
  closeTestId,
  bodyClassName,
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

  const onDragStart = (event: ReactPointerEvent) => {
    if (maximized || !liveFrame) return;
    if ((event.target as HTMLElement).closest("button")) return;
    const start = liveFrame;
    trackPointer(event, (dx, dy, bounds) => {
      setAppFrame(appId, moveDesktopFrame(start, dx, dy, bounds));
    });
  };

  const onResizeStart = (edge: DesktopResizeEdge, event: ReactPointerEvent) => {
    if (maximized || !liveFrame) return;
    const start = liveFrame;
    trackPointer(event, (dx, dy, bounds) => {
      setAppFrame(appId, resizeDesktopFrame(start, edge, dx, dy, bounds));
    });
  };

  return createPortal(
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
        data-chrome="icon-title"
      >
        <header
          className="preview-panel-head desktop-app-window-head is-compact"
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
          <div
            className="desktop-app-window-title-wrap is-spacer"
            aria-hidden
          />
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
              title={
                maximized ? t("desktop.restore") : t("desktop.maximize")
              }
              aria-label={
                maximized ? t("desktop.restore") : t("desktop.maximize")
              }
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
              onClick={() => closeApp(appId)}
            >
              <PreviewCloseIcon />
            </button>
          </div>
        </header>
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
  );
}

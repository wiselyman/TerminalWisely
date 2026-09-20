import { type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
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
import { desktopAppFloatZ } from "../../lib/floatStacking";

/** Match Markdown preview float defaults so dock apps feel the same. */
const DESKTOP_APP_FLOAT_WIDTH = 1120;
const DESKTOP_APP_FLOAT_HEIGHT = 760;

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

export function DesktopAppWindow({
  appId,
  title,
  subtitle,
  leading,
  hideTitleText = false,
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
  const zIndex = useDesktopStore((s) => s.zIndexFor(appId));
  const minimizeApp = useDesktopStore((s) => s.minimizeApp);
  const closeApp = useDesktopStore((s) => s.closeApp);
  const setAppMaximized = useDesktopStore((s) => s.setAppMaximized);
  const focusApp = useDesktopStore((s) => s.focusApp);

  if (!win.open || win.minimized) return null;

  const compact = hideTitleText || Boolean(leading);
  const maximized = win.maximized;

  return createPortal(
    <div
      className={`preview-float-backdrop${maximized ? " maximized" : ""}`}
      role="presentation"
      data-testid={floatTestId}
      style={{ zIndex: desktopAppFloatZ(zIndex), pointerEvents: "none" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          minimizeApp(appId);
        }
      }}
    >
      <div
        className={`preview-float-window desktop-app-window${
          maximized ? " maximized" : ""
        }`}
        role="dialog"
        aria-label={title}
        data-testid={panelTestId}
        data-maximized={maximized ? "true" : "false"}
        data-chrome={compact ? "icon-title" : "full"}
        style={
          maximized
            ? { pointerEvents: "auto" }
            : {
                pointerEvents: "auto",
                width: DESKTOP_APP_FLOAT_WIDTH,
                height: DESKTOP_APP_FLOAT_HEIGHT,
              }
        }
        onMouseDown={(event) => {
          event.stopPropagation();
          focusApp(appId);
        }}
      >
        <header
          className={
            compact
              ? "preview-panel-head desktop-app-window-head is-compact"
              : "preview-panel-head desktop-app-window-head"
          }
        >
          {leading ? (
            <span
              className="desktop-app-window-leading"
              data-testid="desktop-app-window-leading"
              aria-hidden
            >
              {leading}
            </span>
          ) : null}
          {!hideTitleText ? (
            <div className="desktop-app-window-title-wrap">
              <strong className="preview-panel-title desktop-app-window-title">
                {title}
              </strong>
              {subtitle ? (
                <span className="desktop-app-window-sub" title={subtitle}>
                  {subtitle}
                </span>
              ) : null}
            </div>
          ) : (
            <div
              className="desktop-app-window-title-wrap is-spacer"
              aria-hidden
            />
          )}
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
    </div>,
    document.body,
  );
}

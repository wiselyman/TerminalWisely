import { useTranslation } from "react-i18next";
import { useDesktopStore, type DesktopAppId } from "../../stores/desktopStore";
import { DESKTOP_APPS } from "./desktopApps";

export function DesktopIcons() {
  const { t } = useTranslation("tools");
  const apps = useDesktopStore((s) => s.apps);
  const toggleDockApp = useDesktopStore((s) => s.toggleDockApp);

  return (
    <div
      className="host-desktop-icons"
      data-testid="host-desktop-empty"
      aria-label={t("desktop.iconsAria")}
    >
      {DESKTOP_APPS.map((app) => {
        const Icon = app.icon;
        const open = apps[app.id].open && !apps[app.id].minimized;
        return (
          <button
            key={app.id}
            type="button"
            className={`host-desktop-icon${open ? " is-open" : ""}`}
            data-testid={`desktop-icon-${app.id}`}
            onClick={() => toggleDockApp(app.id as DesktopAppId)}
          >
            <span className={`host-desktop-glyph is-${app.id}`}>
              <Icon />
            </span>
            <span className="host-desktop-icon-label">{t(app.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}

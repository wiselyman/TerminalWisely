import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDesktopStore } from "../../stores/desktopStore";
import { DESKTOP_APPS } from "./desktopApps";

export function DesktopDock() {
  const { t } = useTranslation("tools");
  const apps = useDesktopStore((s) => s.apps);
  const toggleDockApp = useDesktopStore((s) => s.toggleDockApp);

  return (
    <nav
      className="host-desktop-dock"
      aria-label={t("desktop.dockAria")}
      data-testid="host-desktop-dock"
    >
      {DESKTOP_APPS.map((app) => {
        const win = apps[app.id];
        const Icon = app.icon;
        const state = !win.open
          ? "idle"
          : win.minimized
            ? "minimized"
            : "open";
        return (
          <button
            key={app.id}
            type="button"
            className={`host-desktop-dock-app is-${state}`}
            data-testid={app.testId}
            data-state={state}
            title={t(app.labelKey)}
            aria-label={t(app.labelKey)}
            onClick={() => toggleDockApp(app.id)}
          >
            <span className={`host-desktop-glyph is-${app.id}`}>
              <Icon />
            </span>
            <span className="host-desktop-dock-label">{t(app.labelKey)}</span>
            {win.open ? (
              <span className="host-desktop-dock-dot" aria-hidden />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export function DesktopClock() {
  const { i18n, t } = useTranslation("tools");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const day = now.toLocaleDateString(i18n.language, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <time className="host-desktop-clock" dateTime={now.toISOString()} aria-label={t("desktop.clockAria")}>
      <span className="host-desktop-clock-day">{day}</span>
      <span className="host-desktop-clock-time">{time}</span>
    </time>
  );
}

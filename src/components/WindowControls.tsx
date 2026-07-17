import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "../lib/isTauri";

type WindowControlsLayout = "macos" | "windows";

interface WindowControlsProps {
  layout: WindowControlsLayout;
}

function MinimizeIcon() {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
      <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
    </svg>
  );
}

function MaximizeIcon({ restored }: { restored: boolean }) {
  if (restored) {
    return (
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
        <path
          d="M3.5 3.5h5v5M4.5 2.5h5v5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
      <rect
        x="2"
        y="2"
        width="8"
        height="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
      <path
        d="M2.5 2.5l7 7M9.5 2.5l-7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function WindowControls({ layout }: WindowControlsProps) {
  const { t } = useTranslation("common");
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const appWindow = getCurrentWindow();
    let disposed = false;

    void appWindow.isMaximized().then((value) => {
      if (!disposed) setMaximized(value);
    });

    const unlistenPromise = appWindow.onResized(() => {
      void appWindow.isMaximized().then((value) => {
        if (!disposed) setMaximized(value);
      });
    });

    return () => {
      disposed = true;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  if (!isTauriRuntime()) return null;

  const appWindow = getCurrentWindow();

  if (layout === "macos") {
    return (
      <div className="window-controls window-controls-macos">
        <button
          type="button"
          className="wc-macos wc-close"
          aria-label={t("close")}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => void appWindow.close()}
        />
        <button
          type="button"
          className="wc-macos wc-minimize"
          aria-label={t("minimize")}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => void appWindow.minimize()}
        />
        <button
          type="button"
          className="wc-macos wc-maximize"
          aria-label={maximized ? t("restore") : t("maximize")}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => void appWindow.toggleMaximize()}
        />
      </div>
    );
  }

  return (
    <div className="window-controls window-controls-windows">
      <button
        type="button"
        className="wc-win wc-minimize"
        aria-label={t("minimize")}
        onClick={() => void appWindow.minimize()}
      >
        <MinimizeIcon />
      </button>
      <button
        type="button"
        className="wc-win wc-maximize"
        aria-label={maximized ? t("restore") : t("maximize")}
        onClick={() => void appWindow.toggleMaximize()}
      >
        <MaximizeIcon restored={maximized} />
      </button>
      <button
        type="button"
        className="wc-win wc-close"
        aria-label={t("close")}
        onClick={() => void appWindow.close()}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

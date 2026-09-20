import { useTranslation } from "react-i18next";
import { useBrowserStore } from "../../stores/browserStore";
import { PreviewCloseIcon } from "../PreviewIcons";

export function BrowserDock() {
  const { t } = useTranslation("tools");
  const open = useBrowserStore((s) => s.open);
  const minimized = useBrowserStore((s) => s.minimized);
  const pageTitle = useBrowserStore((s) => s.pageTitle);
  const url = useBrowserStore((s) => s.url);
  const profileKey = useBrowserStore((s) => s.profileKey);
  const restore = useBrowserStore((s) => s.restore);
  const close = useBrowserStore((s) => s.close);

  if (!open || !minimized) return null;

  const label = pageTitle || url || t("browser.title");

  return (
    <div
      className="preview-dock minimized browser-dock"
      role="tablist"
      aria-label={t("browser.dockAria")}
      data-testid="host-browser-dock"
    >
      <div className="preview-dock-tabs">
        <div className="preview-dock-tab active" role="tab" aria-selected>
          <button
            type="button"
            className="preview-dock-tab-main"
            data-testid="host-browser-dock-restore"
            title={profileKey ?? url}
            onClick={() => void restore()}
          >
            <span className="preview-dock-tab-label">{label}</span>
          </button>
          <button
            type="button"
            className="preview-dock-tab-close"
            data-testid="host-browser-dock-close"
            aria-label={t("browser.dockCloseAria", { label })}
            title={t("browser.dockCloseAria", { label })}
            onClick={(event) => {
              event.stopPropagation();
              void close();
            }}
          >
            <PreviewCloseIcon />
          </button>
        </div>
      </div>
      <button
        type="button"
        className="preview-dock-restore"
        data-testid="host-browser-dock-expand"
        onClick={() => void restore()}
      >
        {t("browser.dockExpand")}
      </button>
    </div>
  );
}

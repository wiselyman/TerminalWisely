import { useTranslation } from "react-i18next";
import { isPreviewTabDirty, previewTabLabel } from "../stores/previewTypes";
import {
  usePreviewStore,
  usePreviewTabsForSession,
} from "../stores/previewStore";
import { PreviewCloseIcon } from "./PreviewIcons";

interface PreviewDockProps {
  sessionId: string;
}

export function PreviewDock({ sessionId }: PreviewDockProps) {
  const { t } = useTranslation("preview");
  const tabs = usePreviewTabsForSession(sessionId);
  const activeTabId = usePreviewStore((s) => s.activeTabId);
  const minimized = usePreviewStore((s) => s.minimized);
  const activateTab = usePreviewStore((s) => s.activateTab);
  const closeTab = usePreviewStore((s) => s.closeTab);
  const restorePreview = usePreviewStore((s) => s.restorePreview);

  if (tabs.length === 0) return null;
  if (tabs.length === 1 && !minimized) return null;

  return (
    <div
      className={`preview-dock${minimized ? " minimized" : ""}`}
      role="tablist"
      aria-label={t("dockAria")}
    >
      <div className="preview-dock-tabs">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const dirty = isPreviewTabDirty(tab);
          const label = previewTabLabel(tab);
          return (
            <div
              key={tab.id}
              className={`preview-dock-tab${active ? " active" : ""}${tab.loading ? " loading" : ""}`}
              role="tab"
              aria-selected={active}
              title={tab.data?.resolved_path ?? tab.path}
            >
              <button
                type="button"
                className="preview-dock-tab-main"
                onClick={() => {
                  activateTab(tab.id);
                  if (minimized) restorePreview();
                }}
              >
                <span className="preview-dock-tab-label">
                  {label}
                  {dirty ? <span className="preview-panel-dirty"> *</span> : null}
                </span>
                {tab.saving ? (
                  <span className="preview-dock-tab-status">{t("common:saving")}</span>
                ) : null}
              </button>
              <button
                type="button"
                className="preview-dock-tab-close"
                aria-label={t("dockCloseAria", { label })}
                title={t("dockCloseAria", { label })}
                onClick={(event) => {
                  event.stopPropagation();
                  void closeTab(tab.id);
                }}
              >
                <PreviewCloseIcon />
              </button>
            </div>
          );
        })}
      </div>
      {minimized ? (
        <button
          type="button"
          className="preview-dock-restore"
          onClick={restorePreview}
        >
          {t("dockExpand")}
        </button>
      ) : null}
    </div>
  );
}

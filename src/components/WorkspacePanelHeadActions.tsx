import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { PinPanelIcon, PanelRightIcon } from "./WorkspaceToolIcons";
import {
  type WorkspacePanelId,
  collapseWorkspacePanel,
} from "../stores/workspacePanelSwitch";
import { useWorkspacePanelPinStore } from "../stores/workspacePanelPin";

type Props = {
  panelId: WorkspacePanelId;
  sessionId: string;
  serverId?: string;
};

const PANEL_ROOT_SELECTOR = [
  ".ai-engineer-panel",
  ".find-panel",
  ".task-manager-panel",
  ".cmd-nav-panel",
].join(", ");

/** Pin + Cursor-style panel-right collapse for every right workspace panel. */
export function WorkspacePanelHeadActions({ panelId }: Props) {
  const { t } = useTranslation("tools");
  const pinned = useWorkspacePanelPinStore((s) => s.pinnedId === panelId);
  const togglePinned = useWorkspacePanelPinStore((s) => s.togglePinned);

  const collapseToRight = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const panel = event.currentTarget.closest(
      PANEL_ROOT_SELECTOR,
    ) as HTMLElement | null;

    const finish = () => {
      collapseWorkspacePanel(panelId);
    };

    if (!panel || panel.classList.contains("workspace-panel-exiting")) {
      finish();
      return;
    }

    panel.classList.add("workspace-panel-exiting");
    let done = false;
    const complete = () => {
      if (done) return;
      done = true;
      panel.removeEventListener("transitionend", onEnd);
      window.clearTimeout(fallback);
      finish();
    };
    const onEnd = (ev: TransitionEvent) => {
      if (ev.target !== panel) return;
      if (ev.propertyName !== "transform" && ev.propertyName !== "opacity") {
        return;
      }
      complete();
    };
    panel.addEventListener("transitionend", onEnd);
    const fallback = window.setTimeout(complete, 280);
  };

  return (
    <div className="workspace-panel-head-actions">
      <button
        type="button"
        className={`workspace-panel-icon-btn${pinned ? " is-active" : ""}`}
        aria-pressed={pinned}
        aria-label={pinned ? t("panel.unpin") : t("panel.pin")}
        title={pinned ? t("panel.unpin") : t("panel.pin")}
        onClick={() => togglePinned(panelId)}
      >
        <PinPanelIcon />
      </button>
      <button
        type="button"
        className="workspace-panel-icon-btn"
        aria-label={t("panel.collapse")}
        title={t("panel.collapse")}
        onClick={collapseToRight}
      >
        <PanelRightIcon />
      </button>
    </div>
  );
}

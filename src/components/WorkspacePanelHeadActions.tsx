import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PanelRightIcon } from "./WorkspaceToolIcons";
import {
  type WorkspacePanelId,
  collapseWorkspacePanel,
} from "../stores/workspacePanelSwitch";

type Props = {
  panelId: WorkspacePanelId;
  sessionId: string;
  serverId?: string;
  children?: ReactNode;
};

const PANEL_ROOT_SELECTOR = [
  ".ai-engineer-panel",
  ".local-fs-panel",
  ".find-panel",
  ".task-manager-panel",
  ".cmd-nav-panel",
].join(", ");

/** Cursor-style panel-right collapse for every right workspace panel. */
export function WorkspacePanelHeadActions({ panelId, children }: Props) {
  const { t } = useTranslation("tools");

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
      {children}
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

import { unstable_batchedUpdates } from "react-dom";
import { useAiEngineerStore } from "./aiEngineerStore";
import { useCommandNavigatorStore } from "./commandNavigatorStore";
import { useFindStore } from "./findStore";
import { useHostStatsStore } from "./hostStatsStore";
import { useTaskManagerStore } from "./taskManagerStore";

export type WorkspacePanelId =
  | "aiEngineer"
  | "taskManager"
  | "find"
  | "hostStats"
  | "commandNav";

function closeOtherWorkspacePanels(except?: WorkspacePanelId) {
  if (except !== "aiEngineer") useAiEngineerStore.getState().close();
  if (except !== "taskManager") useTaskManagerStore.getState().close();
  if (except !== "find") useFindStore.getState().close();
  if (except !== "hostStats") useHostStatsStore.getState().close();
  if (except !== "commandNav") useCommandNavigatorStore.getState().close();
}

function closeAllWorkspacePanels() {
  closeOtherWorkspacePanels();
}

function isPanelOpen(id: WorkspacePanelId): boolean {
  switch (id) {
    case "aiEngineer":
      return useAiEngineerStore.getState().open;
    case "taskManager":
      return useTaskManagerStore.getState().open;
    case "find":
      return useFindStore.getState().open;
    case "hostStats":
      return useHostStatsStore.getState().open;
    case "commandNav":
      return useCommandNavigatorStore.getState().open;
  }
}

function openWorkspacePanel(
  id: WorkspacePanelId,
  sessionId: string,
  serverId?: string,
) {
  switch (id) {
    case "aiEngineer":
      useAiEngineerStore.getState().openPanel(sessionId, serverId);
      break;
    case "taskManager":
      useTaskManagerStore.setState({ open: true });
      break;
    case "find":
      useFindStore.getState().openFind(sessionId);
      break;
    case "hostStats":
      useHostStatsStore.setState({ open: true });
      break;
    case "commandNav":
      useCommandNavigatorStore.getState().openPanel(sessionId);
      break;
  }
}

export function closeWorkspacePanels() {
  closeAllWorkspacePanels();
}

/** Bring AI panel to front without aborting a run (e.g. approval / ask-user). */
export function revealAiEngineerPanel() {
  unstable_batchedUpdates(() => {
    closeOtherWorkspacePanels("aiEngineer");
    useAiEngineerStore.setState({ open: true });
  });
}

export function switchWorkspacePanel(
  id: WorkspacePanelId,
  sessionId: string,
  serverId?: string,
) {
  if (isPanelOpen(id)) {
    switch (id) {
      case "aiEngineer":
        useAiEngineerStore.getState().close();
        break;
      case "taskManager":
        useTaskManagerStore.getState().close();
        break;
      case "find":
        useFindStore.getState().close();
        break;
      case "hostStats":
        useHostStatsStore.getState().close();
        break;
      case "commandNav":
        useCommandNavigatorStore.getState().close();
        break;
    }
    return;
  }

  unstable_batchedUpdates(() => {
    closeOtherWorkspacePanels(id);
    openWorkspacePanel(id, sessionId, serverId);
  });
}

import { unstable_batchedUpdates } from "react-dom";
import { useCommandNavigatorStore } from "./commandNavigatorStore";
import { useFindStore } from "./findStore";
import { useHostStatsStore } from "./hostStatsStore";
import { useTaskManagerStore } from "./taskManagerStore";

export type WorkspacePanelId =
  | "taskManager"
  | "find"
  | "hostStats"
  | "commandNav";

function closeAllWorkspacePanels() {
  useTaskManagerStore.getState().close();
  useFindStore.getState().close();
  useHostStatsStore.getState().close();
  useCommandNavigatorStore.getState().close();
}

function isPanelOpen(id: WorkspacePanelId): boolean {
  switch (id) {
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

function openWorkspacePanel(id: WorkspacePanelId, sessionId: string) {
  switch (id) {
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

/** Close any open workspace side panel (task manager, find, host stats, command nav). */
export function closeWorkspacePanels() {
  closeAllWorkspacePanels();
}

/** Tab-like switch: click another tool opens it immediately; re-click active tool closes it. */
export function switchWorkspacePanel(id: WorkspacePanelId, sessionId: string) {
  if (isPanelOpen(id)) {
    switch (id) {
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
    closeAllWorkspacePanels();
    openWorkspacePanel(id, sessionId);
  });
}

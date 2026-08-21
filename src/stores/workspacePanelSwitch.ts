import { unstable_batchedUpdates } from "react-dom";
import { useAiEngineerStore } from "./aiEngineerStore";
import { useCommandNavigatorStore } from "./commandNavigatorStore";
import { useFindStore } from "./findStore";
import { useTaskManagerStore } from "./taskManagerStore";
import { useWorkspacePanelPinStore } from "./workspacePanelPin";

export type WorkspacePanelId =
  | "aiEngineer"
  | "taskManager"
  | "find"
  | "commandNav";

let animateNextWorkspacePanelEnter = true;

function closeOtherWorkspacePanels(except?: WorkspacePanelId) {
  if (except !== "aiEngineer")
    useAiEngineerStore.getState().close({ force: true });
  if (except !== "taskManager") useTaskManagerStore.getState().close();
  if (except !== "find") useFindStore.getState().close();
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
    case "commandNav":
      return useCommandNavigatorStore.getState().open;
  }
}

function hasAnyWorkspacePanelOpen() {
  return (
    isPanelOpen("aiEngineer") ||
    isPanelOpen("taskManager") ||
    isPanelOpen("find") ||
    isPanelOpen("commandNav")
  );
}

function closePanel(id: WorkspacePanelId) {
  switch (id) {
    case "aiEngineer":
      useAiEngineerStore.getState().close({ force: true });
      break;
    case "taskManager":
      useTaskManagerStore.getState().close();
      break;
    case "find":
      useFindStore.getState().close();
      break;
    case "commandNav":
      useCommandNavigatorStore.getState().close();
      break;
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
    case "commandNav":
      useCommandNavigatorStore.getState().openPanel(sessionId);
      break;
  }
}

export function closeWorkspacePanels() {
  if (useWorkspacePanelPinStore.getState().pinned) return;
  closeAllWorkspacePanels();
}

/** Close the open panel unless the right dock is pinned. */
export function dismissWorkspacePanelIfUnpinned(id: WorkspacePanelId) {
  if (!isPanelOpen(id)) return;
  if (useWorkspacePanelPinStore.getState().pinned) return;
  closePanel(id);
}

/** Explicit panel-right collapse (always wins over pin). */
export function collapseWorkspacePanel(id: WorkspacePanelId) {
  useWorkspacePanelPinStore.getState().setPinned(false);
  if (!isPanelOpen(id)) return;
  closePanel(id);
}

/** Bring AI panel to front without aborting a run (e.g. approval / ask-user). */
export function revealAiEngineerPanel() {
  animateNextWorkspacePanelEnter = !hasAnyWorkspacePanelOpen();
  unstable_batchedUpdates(() => {
    closeOtherWorkspacePanels("aiEngineer");
    useAiEngineerStore.setState({ open: true });
  });
}

export function shouldAnimateWorkspacePanelEnter() {
  const shouldAnimate = animateNextWorkspacePanelEnter;
  animateNextWorkspacePanelEnter = true;
  return shouldAnimate;
}

export function switchWorkspacePanel(
  id: WorkspacePanelId,
  sessionId: string,
  serverId?: string,
) {
  if (isPanelOpen(id)) {
    if (useWorkspacePanelPinStore.getState().pinned) return;
    closePanel(id);
    return;
  }

  animateNextWorkspacePanelEnter = !hasAnyWorkspacePanelOpen();
  unstable_batchedUpdates(() => {
    closeOtherWorkspacePanels(id);
    openWorkspacePanel(id, sessionId, serverId);
  });
}

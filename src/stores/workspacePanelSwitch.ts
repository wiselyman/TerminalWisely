import { unstable_batchedUpdates } from "react-dom";
import { useAiEngineerStore } from "./aiEngineerStore";
import { useFindStore } from "./findStore";
import { useLocalFsStore } from "./localFsStore";
import { useTaskManagerStore } from "./taskManagerStore";
import type { LocalFsState } from "./localFsStore";
import type { ManagedEntityRef } from "../lib/management/types";
import type { K8sClusterTarget } from "../lib/k8s/types";

export type WorkspacePanelId =
  | "aiEngineer"
  | "localFs"
  | "taskManager"
  | "find";

let animateNextWorkspacePanelEnter = true;

function closeOtherWorkspacePanels(except?: WorkspacePanelId) {
  if (except !== "aiEngineer")
    useAiEngineerStore.getState().close({ force: true });
  if (except !== "localFs") useLocalFsStore.getState().close();
  if (except !== "taskManager") useTaskManagerStore.getState().close();
  if (except !== "find") useFindStore.getState().close();
}

function isPanelOpen(id: WorkspacePanelId): boolean {
  switch (id) {
    case "aiEngineer":
      return useAiEngineerStore.getState().open;
    case "localFs":
      return useLocalFsStore.getState().open;
    case "taskManager":
      return useTaskManagerStore.getState().open;
    case "find":
      return useFindStore.getState().open;
  }
}

function hasAnyWorkspacePanelOpen() {
  return (
    isPanelOpen("aiEngineer") ||
    isPanelOpen("localFs") ||
    isPanelOpen("taskManager") ||
    isPanelOpen("find")
  );
}

function closePanel(id: WorkspacePanelId) {
  switch (id) {
    case "aiEngineer":
      useAiEngineerStore.getState().close({ force: true });
      break;
    case "localFs":
      useLocalFsStore.getState().close();
      break;
    case "taskManager":
      useTaskManagerStore.getState().close();
      break;
    case "find":
      useFindStore.getState().close();
      break;
  }
}

function openWorkspacePanel(
  id: WorkspacePanelId,
  sessionId: string,
  serverId?: string,
  localFsTab?: LocalFsState["activeTab"],
) {
  switch (id) {
    case "aiEngineer":
      useAiEngineerStore.getState().bindManagedEntity(
        {
          kind: "server",
          id: serverId || sessionId,
          label: sessionId,
          sessionId,
          serverId: serverId ?? null,
        },
        { open: true },
      );
      break;
    case "localFs":
      useLocalFsStore.getState().openPanel(sessionId, localFsTab);
      break;
    case "taskManager":
      useTaskManagerStore.setState({ open: true });
      break;
    case "find":
      useFindStore.getState().openFind(sessionId);
      break;
  }
}

/** Explicit panel-right collapse — the only way to dismiss the side panel. */
export function collapseWorkspacePanel(id: WorkspacePanelId) {
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

/**
 * Open AI Engineer and close LocalFs / other right panels.
 * Titlebar AI button must use this — bindManagedEntity alone leaves LocalFs on top.
 */
export function switchToAiEngineerPanel(
  ref: ManagedEntityRef,
  opts?: { clusterTarget?: K8sClusterTarget | null },
) {
  if (
    isPanelOpen("aiEngineer") &&
    !isPanelOpen("localFs") &&
    !isPanelOpen("taskManager") &&
    !isPanelOpen("find")
  ) {
    // Already sole open panel — keep open until panel-right collapse.
    useAiEngineerStore.getState().bindManagedEntity(ref, {
      open: true,
      clusterTarget: opts?.clusterTarget,
    });
    return;
  }

  animateNextWorkspacePanelEnter = !hasAnyWorkspacePanelOpen();
  unstable_batchedUpdates(() => {
    closeOtherWorkspacePanels("aiEngineer");
    useAiEngineerStore.getState().bindManagedEntity(ref, {
      open: true,
      clusterTarget: opts?.clusterTarget,
    });
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
  localFsTab?: LocalFsState["activeTab"],
) {
  // Already open: keep it open until the user clicks panel-right collapse.
  if (isPanelOpen(id)) return;

  animateNextWorkspacePanelEnter = !hasAnyWorkspacePanelOpen();
  unstable_batchedUpdates(() => {
    closeOtherWorkspacePanels(id);
    openWorkspacePanel(id, sessionId, serverId, localFsTab);
  });
}

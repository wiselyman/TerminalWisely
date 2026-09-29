import { useDesktopStore } from "./desktopStore";
import {
  closeDesktopRemembering,
  openDesktopRemembered,
} from "./hostWorkspaceMemory";
import { useAiEngineerStore } from "./aiEngineerStore";
import { useBrowserStore } from "./browserStore";
import { useFindStore } from "./findStore";
import { useLocalFsStore } from "./localFsStore";
import { useSessionStore } from "./sessionStore";
import { useTaskManagerStore } from "./taskManagerStore";
import type { LocalFsState } from "./localFsStore";
import type { ManagedEntityRef } from "../lib/management/types";
import type { K8sClusterTarget } from "../lib/k8s/types";
import { unstable_batchedUpdates } from "react-dom";

export type WorkspacePanelId =
  | "aiEngineer"
  | "desktop"
  | "localFs"
  | "taskManager"
  | "find"
  | "browser";

let animateNextWorkspacePanelEnter = true;

function closeOtherWorkspacePanels(except?: WorkspacePanelId) {
  if (except !== "aiEngineer")
    useAiEngineerStore.getState().close({ force: true });
  if (except !== "desktop") closeDesktopRemembering();
  if (except !== "localFs") useLocalFsStore.getState().close();
  if (except !== "taskManager") useTaskManagerStore.getState().close();
  if (except !== "find") useFindStore.getState().close();
  if (except !== "browser") {
    const browser = useBrowserStore.getState();
    if (browser.open && !browser.minimized) {
      void browser.minimize();
    }
  }
}

function isPanelOpen(id: WorkspacePanelId): boolean {
  switch (id) {
    case "aiEngineer":
      return useAiEngineerStore.getState().open;
    case "desktop":
      return useDesktopStore.getState().open;
    case "localFs":
      return useLocalFsStore.getState().open;
    case "taskManager":
      return useTaskManagerStore.getState().open;
    case "find":
      return useFindStore.getState().open;
    case "browser":
      return useBrowserStore.getState().open;
  }
}

function hasAnyWorkspacePanelOpen() {
  return (
    isPanelOpen("aiEngineer") ||
    isPanelOpen("desktop") ||
    isPanelOpen("localFs") ||
    isPanelOpen("taskManager") ||
    isPanelOpen("find") ||
    isPanelOpen("browser")
  );
}

function closePanel(id: WorkspacePanelId) {
  switch (id) {
    case "aiEngineer":
      useAiEngineerStore.getState().close({ force: true });
      break;
    case "desktop":
      closeDesktopRemembering();
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
    case "browser":
      void useBrowserStore.getState().close();
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
    case "desktop":
      openDesktopRemembered(sessionId);
      break;
    case "localFs":
      // Legacy: route to desktop + optional files app.
      useDesktopStore.getState().openDesktop(sessionId);
      if (localFsTab === "find") {
        useDesktopStore.getState().launchApp("files", { filesTab: "find" });
      } else if (localFsTab === "taskManager") {
        useDesktopStore.getState().launchApp("processes");
      } else if (localFsTab === "files") {
        useDesktopStore.getState().launchApp("files", { filesTab: "files" });
      }
      break;
    case "taskManager":
      useDesktopStore.getState().openDesktop(sessionId);
      useDesktopStore.getState().launchApp("processes");
      break;
    case "find":
      useDesktopStore.getState().openDesktop(sessionId);
      useDesktopStore.getState().launchApp("files", { filesTab: "find" });
      break;
    case "browser":
      useDesktopStore.getState().openDesktop(sessionId);
      useDesktopStore.getState().launchApp("browser");
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
  const ai = useAiEngineerStore.getState();
  // Never reopen a parked host's chat on top of a different active terminal.
  if (ai.sessionId) {
    const active = useSessionStore.getState().activeTabId;
    if (active && active !== ai.sessionId) {
      return;
    }
  }
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
    !isPanelOpen("desktop") &&
    !isPanelOpen("localFs") &&
    !isPanelOpen("taskManager") &&
    !isPanelOpen("find") &&
    !isPanelOpen("browser")
  ) {
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

/** Host-tab restore must not play the right-edge slide-in. */
export function skipNextWorkspacePanelEnter() {
  animateNextWorkspacePanelEnter = false;
}

export function switchWorkspacePanel(
  id: WorkspacePanelId,
  sessionId: string,
  serverId?: string,
  localFsTab?: LocalFsState["activeTab"],
) {
  // Browser / legacy localFs shortcuts: keep desktop shell, launch the app.
  if (id === "browser") {
    if (!useDesktopStore.getState().open) {
      animateNextWorkspacePanelEnter = !hasAnyWorkspacePanelOpen();
      unstable_batchedUpdates(() => {
        closeOtherWorkspacePanels("desktop");
        useDesktopStore.getState().openDesktop(sessionId);
      });
    }
    useDesktopStore.getState().toggleDockApp("browser");
    return;
  }

  if (id === "localFs" || id === "find" || id === "taskManager") {
    if (!useDesktopStore.getState().open) {
      animateNextWorkspacePanelEnter = !hasAnyWorkspacePanelOpen();
      unstable_batchedUpdates(() => {
        closeOtherWorkspacePanels("desktop");
        useDesktopStore.getState().openDesktop(sessionId);
      });
    }
    if (id === "find" || localFsTab === "find") {
      useDesktopStore.getState().launchApp("files", { filesTab: "find" });
    } else if (id === "taskManager" || localFsTab === "taskManager") {
      useDesktopStore.getState().launchApp("processes");
    } else if (localFsTab === "files") {
      useDesktopStore.getState().launchApp("files", { filesTab: "files" });
    }
    return;
  }

  if (isPanelOpen(id)) return;

  animateNextWorkspacePanelEnter = !hasAnyWorkspacePanelOpen();
  unstable_batchedUpdates(() => {
    closeOtherWorkspacePanels(id);
    openWorkspacePanel(id, sessionId, serverId, localFsTab);
  });
}

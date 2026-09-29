import { unstable_batchedUpdates } from "react-dom";
import type { DesktopWindowFrame } from "../lib/desktopWindowFrame";
import { registerDesktopAiBridge } from "../lib/desktopAiBridge";
import {
  useDesktopStore,
  type DesktopAppId,
  type DesktopAppWindow,
} from "./desktopStore";
import { useAiEngineerStore } from "./aiEngineerStore";
import { useFindStore } from "./findStore";
import { useLocalFsStore } from "./localFsStore";
import { useTaskManagerStore } from "./taskManagerStore";
import { useBrowserStore } from "./browserStore";
import { skipNextWorkspacePanelEnter } from "./workspacePanelSwitch";

export type HostShellPanel = "none" | "desktop" | "aiEngineer";

export type HostDesktopUiSnapshot = {
  apps: Record<DesktopAppId, DesktopAppWindow>;
  focusOrder: DesktopAppId[];
  filesTab: "files" | "find";
  frames?: Partial<Record<DesktopAppId, DesktopWindowFrame>>;
};

export type HostWorkspaceSnapshot = {
  panel: HostShellPanel;
  desktop: HostDesktopUiSnapshot | null;
};

const snapshots = new Map<string, HostWorkspaceSnapshot>();

/** SSH sessions whose AI panel fiber should stay mounted (cross-host isolation). */
const aiFiberSessions = new Set<string>();
let aiFiberEpoch = 0;
const aiFiberListeners = new Set<() => void>();

function bumpAiFibers() {
  aiFiberEpoch += 1;
  for (const listener of aiFiberListeners) listener();
}

export function rememberAiFiber(sessionId: string): void {
  if (!sessionId || aiFiberSessions.has(sessionId)) return;
  aiFiberSessions.add(sessionId);
  bumpAiFibers();
}

export function forgetAiFiber(sessionId: string): void {
  if (!aiFiberSessions.delete(sessionId)) return;
  bumpAiFibers();
}

export function listAiFiberSessions(): string[] {
  return [...aiFiberSessions];
}

export function getAiFiberEpoch(): number {
  return aiFiberEpoch;
}

export function subscribeAiFibers(listener: () => void): () => void {
  aiFiberListeners.add(listener);
  return () => {
    aiFiberListeners.delete(listener);
  };
}

/** Remember that this host's shell is the AI panel (survives soft-hide). */
export function markHostAiShell(sessionId: string): void {
  if (!sessionId) return;
  rememberAiFiber(sessionId);
  snapshots.set(sessionId, { panel: "aiEngineer", desktop: null });
}

/** Pending connect tab id → real session id (workspace + fiber keys). */
export function migrateHostWorkspace(fromId: string, toId: string): void {
  if (!fromId || !toId || fromId === toId) return;
  const snap = snapshots.get(fromId);
  if (snap) {
    snapshots.set(toId, snap);
    snapshots.delete(fromId);
  }
  if (aiFiberSessions.delete(fromId)) {
    aiFiberSessions.add(toId);
    bumpAiFibers();
  }
  const ai = useAiEngineerStore.getState();
  if (ai.sessionId === fromId) {
    useAiEngineerStore.setState({ sessionId: toId });
  }
}

function cloneDesktopUi(
  apps: Record<DesktopAppId, DesktopAppWindow>,
  focusOrder: DesktopAppId[],
  filesTab: "files" | "find",
  frames?: HostDesktopUiSnapshot["frames"],
): HostDesktopUiSnapshot {
  const copy = (win?: DesktopAppWindow): DesktopAppWindow => ({
    open: !!win?.open,
    minimized: !!win?.minimized,
    maximized: !!win?.maximized,
  });
  return {
    apps: {
      files: copy(apps.files),
      processes: copy(apps.processes),
      browser: copy(apps.browser),
      terminal: copy(apps.terminal),
      aiLinux: copy(apps.aiLinux),
    },
    focusOrder: [...focusOrder],
    filesTab,
    frames: frames ? { ...frames } : {},
  };
}

function idleApps(): Record<DesktopAppId, DesktopAppWindow> {
  return {
    files: { open: false, minimized: false, maximized: false },
    processes: { open: false, minimized: false, maximized: false },
    browser: { open: false, minimized: false, maximized: false },
    terminal: { open: false, minimized: false, maximized: false },
    aiLinux: { open: false, minimized: false, maximized: false },
  };
}

/// Hide native browser overlays without destroying SOCKS/webviews.
/// Only hide the *current* host — never `hide_all` (that blacks out WKWebViews
/// for every host and breaks warm restore).
function parkBrowserOverlays() {
  void useBrowserStore.getState().park();
}

/**
 * Close desktop chrome without `browser.close()` shutdown — host switch must
 * keep each host's webviews warm.
 */
function softCloseDesktop() {
  const desk = useDesktopStore.getState();
  if (!desk.open) {
    useLocalFsStore.getState().close();
    useTaskManagerStore.getState().close();
    useFindStore.getState().close();
    return;
  }
  if (desk.apps.files.open) {
    useLocalFsStore.getState().close();
  }
  if (desk.apps.processes.open) {
    useTaskManagerStore.getState().close();
  }
  useDesktopStore.setState({
    open: false,
    sessionId: null,
    apps: idleApps(),
    frames: {},
    focusOrder: [],
    filesTab: "files",
  });
}

/** Remember the shell for a host before switching away. */
export function captureHostWorkspace(sessionId: string): void {
  const ai = useAiEngineerStore.getState();
  const desk = useDesktopStore.getState();

  if (desk.open && desk.sessionId === sessionId) {
    snapshots.set(sessionId, {
      panel: "desktop",
      desktop: cloneDesktopUi(
        desk.apps,
        desk.focusOrder,
        desk.filesTab,
        desk.frames,
      ),
    });
    return;
  }
  if (ai.open && ai.sessionId === sessionId) {
    markHostAiShell(sessionId);
    return;
  }
  // Soft-hidden AI fiber: never wipe aiEngineer → none (connect-tab path
  // used to miss capture and then destroy the first host's AI on return).
  if (aiFiberSessions.has(sessionId)) {
    const prev = snapshots.get(sessionId);
    if (prev?.panel === "desktop") return;
    markHostAiShell(sessionId);
    return;
  }
  snapshots.set(sessionId, { panel: "none", desktop: null });
}

export function peekHostWorkspace(
  sessionId: string,
): HostWorkspaceSnapshot | undefined {
  return snapshots.get(sessionId);
}

/** Snapshot open windows, then leave the desktop. */
export function closeDesktopRemembering(): void {
  const desk = useDesktopStore.getState();
  if (desk.open && desk.sessionId) {
    captureHostWorkspace(desk.sessionId);
  }
  desk.close();
}

/** Reopen the desktop and put back the windows from the last leave. */
export function openDesktopRemembered(sessionId: string): void {
  const snap = snapshots.get(sessionId);
  useDesktopStore.getState().openDesktop(sessionId);
  if (snap?.panel === "desktop" && snap.desktop) {
    useDesktopStore.getState().applySessionUi(snap.desktop);
  }
}

export function discardHostWorkspace(sessionId: string): void {
  snapshots.delete(sessionId);
  forgetAiFiber(sessionId);
  useBrowserStore.getState().discardSessionBucket(sessionId);
}

/**
 * Restore the shell for `sessionId` (default: terminal only).
 * Soft-swaps panels to avoid tearing down warm browser webviews.
 */
export function restoreHostWorkspace(
  sessionId: string,
  opts?: { serverId?: string | null; label?: string },
): void {
  const snap = snapshots.get(sessionId) ?? {
    panel: "none" as const,
    desktop: null,
  };

  parkBrowserOverlays();
  // Soft host restore: keep panels from sliding in again.
  skipNextWorkspacePanelEnter();

  unstable_batchedUpdates(() => {
    const ai = useAiEngineerStore.getState();

    if (snap.panel === "aiEngineer") {
      softCloseDesktop();
      rememberAiFiber(sessionId);
      // Same host AI was only closed (open=false) — reopen without rebinding scope
      // so the message list does not flash/reload from disk.
      if (ai.sessionId === sessionId && ai.chatScope) {
        useAiEngineerStore.setState({ open: true });
        return;
      }
      // AI↔AI host swap: keep open=true across bind so the frame margin does not twitch.
      useAiEngineerStore.getState().bindManagedEntity(
        {
          kind: "server",
          id: opts?.serverId || sessionId,
          label: opts?.label || sessionId,
          sessionId,
          serverId: opts?.serverId ?? null,
        },
        { open: true },
      );
      return;
    }

    if (ai.open) {
      // Soft-hide: keep fiber + transcript; do not tear down for host switch.
      // A desktop snapshot already recorded for this host must stay desktop.
      if (ai.sessionId && snapshots.get(ai.sessionId)?.panel !== "desktop") {
        markHostAiShell(ai.sessionId);
      }
      useAiEngineerStore.setState({ open: false });
    }

    if (snap.panel === "desktop") {
      const deskOpen = useDesktopStore.getState().open;
      if (!deskOpen) {
        skipNextWorkspacePanelEnter();
      }
      useDesktopStore.getState().openDesktop(sessionId);
      if (snap.desktop) {
        useDesktopStore.getState().applySessionUi(snap.desktop);
      }
      return;
    }

    softCloseDesktop();
  });
}

function bindDesktopAiLinux(sessionId: string) {
  rememberAiFiber(sessionId);
  void import("./sessionStore").then(({ useSessionStore }) => {
    const desk = useDesktopStore.getState();
    if (!desk.open || desk.sessionId !== sessionId || !desk.apps.aiLinux.open) {
      return;
    }
    const tab = useSessionStore.getState().tabs.find((t) => t.id === sessionId);
    useAiEngineerStore.getState().bindManagedEntity(
      {
        kind: "server",
        id: tab?.server_id || sessionId,
        label: tab?.title || sessionId,
        sessionId,
        serverId: tab?.server_id ?? null,
      },
      { open: true },
    );
  });
}

function parkDesktopAiLinux() {
  useAiEngineerStore.setState({ open: false });
}

registerDesktopAiBridge({
  bind: bindDesktopAiLinux,
  park: parkDesktopAiLinux,
});

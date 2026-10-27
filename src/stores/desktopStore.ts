import { create } from "zustand";
import {
  readWorkspacePanelWidth,
  setWorkspacePanelWidth,
  subscribeWorkspacePanelWidth,
} from "../lib/workspacePanelWidth";
import { bindDesktopAi, parkDesktopAi } from "../lib/desktopAiBridge";
import type { DesktopWindowFrame } from "../lib/desktopWindowFrame";
import { desktopTargetKey, isSshDesktopTarget, type DesktopTarget } from "../lib/desktopTarget";
import { useBrowserStore } from "./browserStore";
import { useFindStore } from "./findStore";
import { useLocalFsStore } from "./localFsStore";
import { useTaskManagerStore } from "./taskManagerStore";

export type DesktopAppId =
  | "files"
  | "processes"
  | "browser"
  | "terminal"
  | "aiLinux"
  | "markwisely";

export interface DesktopAppWindow {
  open: boolean;
  minimized: boolean;
  /** When true, the float fills the desktop surface (not the sidebar). */
  maximized: boolean;
}

type AppsState = Record<DesktopAppId, DesktopAppWindow>;

const idleApp = (): DesktopAppWindow => ({
  open: false,
  minimized: false,
  maximized: false,
});

function idleApps(): AppsState {
  return {
    files: idleApp(),
    processes: idleApp(),
    browser: idleApp(),
    terminal: idleApp(),
    aiLinux: idleApp(),
    markwisely: idleApp(),
  };
}

export function cloneDesktopApps(
  apps: Partial<Record<DesktopAppId, DesktopAppWindow>> | null | undefined,
): AppsState {
  const next = idleApps();
  if (!apps) return next;
  for (const id of Object.keys(next) as DesktopAppId[]) {
    const win = apps[id];
    if (!win) continue;
    next[id] = {
      open: !!win.open,
      minimized: !!win.minimized,
      maximized: !!win.maximized,
    };
  }
  return next;
}

function bringToFront(
  focusOrder: DesktopAppId[],
  app: DesktopAppId,
): DesktopAppId[] {
  return [...focusOrder.filter((id) => id !== app), app];
}

interface DesktopState {
  open: boolean;
  target: DesktopTarget | null;
  /** Compatibility alias for existing SSH-only consumers. */
  sessionId: string | null;
  width: number;
  apps: AppsState;
  /** Surface-relative rectangles. Missing means "center on next open". */
  frames: Partial<Record<DesktopAppId, DesktopWindowFrame>>;
  /** Bumps on every drag/resize so the browser layer can follow. */
  frameRevision: number;
  /** Last-focused last; used for windowed z-index. */
  focusOrder: DesktopAppId[];
  /** File manager: "find" focuses path-bar search. */
  filesTab: "files" | "find";
  openDesktopTarget: (target: DesktopTarget) => void;
  openDesktop: (sessionId: string) => void;
  close: () => void;
  setWidth: (width: number) => void;
  setFilesTab: (tab: "files" | "find") => void;
  launchApp: (app: DesktopAppId, opts?: { filesTab?: "files" | "find" }) => void;
  minimizeApp: (app: DesktopAppId) => void;
  restoreApp: (app: DesktopAppId) => void;
  closeApp: (app: DesktopAppId) => void;
  setAppMaximized: (app: DesktopAppId, maximized: boolean) => void;
  setAppFrame: (app: DesktopAppId, frame: DesktopWindowFrame) => void;
  focusApp: (app: DesktopAppId) => void;
  /** Dock click: launch, restore, or focus. */
  toggleDockApp: (app: DesktopAppId) => void;
  zIndexFor: (app: DesktopAppId) => number;
  /** Re-open apps after host tab restore (does not change sessionId). */
  applySessionUi: (ui: {
    apps: AppsState;
    focusOrder: DesktopAppId[];
    filesTab: "files" | "find";
    frames?: Partial<Record<DesktopAppId, DesktopWindowFrame>>;
  }) => void;
}

function patchApp(
  apps: AppsState,
  id: DesktopAppId,
  patch: Partial<DesktopAppWindow>,
): AppsState {
  return { ...apps, [id]: { ...apps[id], ...patch } };
}

export const useDesktopStore = create<DesktopState>((set, get) => {
  const targetSnapshots = new Map<string, {
    apps: AppsState;
    frames: Partial<Record<DesktopAppId, DesktopWindowFrame>>;
    focusOrder: DesktopAppId[];
    filesTab: "files" | "find";
  }>();

  const rememberActiveTarget = () => {
    const state = get();
    if (!state.target) return;
    targetSnapshots.set(desktopTargetKey(state.target), {
      apps: cloneDesktopApps(state.apps),
      frames: { ...state.frames },
      focusOrder: [...state.focusOrder],
      filesTab: state.filesTab,
    });
  };

  subscribeWorkspacePanelWidth((width) => {
    set({ width });
  });

  return {
    open: false,
    target: null,
    sessionId: null,
    width: readWorkspacePanelWidth(),
    apps: idleApps(),
    frames: {},
    frameRevision: 0,
    focusOrder: [],
    filesTab: "files",

    setWidth: (width) => {
      set({ width: setWorkspacePanelWidth(width) });
    },

    setFilesTab: (tab) => {
      set({ filesTab: tab });
      if (isSshDesktopTarget(get().target)) {
        useLocalFsStore.getState().setActiveTab("files");
      }
      if (tab === "find") {
        useFindStore.setState((s) => ({
          focusNonce: s.focusNonce + 1,
        }));
      }
    },

    openDesktopTarget: (target) => {
      const current = get();
      const key = desktopTargetKey(target);
      if (current.open && current.target && desktopTargetKey(current.target) === key) return;
      rememberActiveTarget();
      const saved = targetSnapshots.get(key);
      set({
        open: true,
        target,
        sessionId: isSshDesktopTarget(target) ? target.sessionId : null,
        apps: saved ? cloneDesktopApps(saved.apps) : idleApps(),
        frames: saved ? { ...saved.frames } : {},
        focusOrder: saved ? [...saved.focusOrder] : [],
        filesTab: saved?.filesTab ?? "files",
        frameRevision: get().frameRevision + 1,
      });
      if (isSshDesktopTarget(target)) {
        useLocalFsStore.getState().activateSession(target.sessionId);
        useFindStore.getState().activateSession(target.sessionId);
      }
    },

    openDesktop: (sessionId) => get().openDesktopTarget({ kind: "ssh", sessionId }),

    close: () => {
      const { apps, target } = get();
      rememberActiveTarget();
      // Always park native browser if any session still owns a surface —
      // apps.browser.open can lag behind async close during host tab switches.
      if (isSshDesktopTarget(target) && (apps.browser.open || useBrowserStore.getState().webviewLabel)) {
        void useBrowserStore.getState().close();
      }
      if (isSshDesktopTarget(target) && apps.files.open) {
        useLocalFsStore.getState().close();
      }
      if (isSshDesktopTarget(target) && apps.processes.open) {
        useTaskManagerStore.getState().close();
      }
      if (isSshDesktopTarget(target)) parkDesktopAi();
      set({
        open: false,
        target: null,
        sessionId: null,
        apps: idleApps(),
        frames: {},
        focusOrder: [],
        filesTab: "files",
      });
    },

    focusApp: (app) => {
      set({ focusOrder: bringToFront(get().focusOrder, app) });
    },

    zIndexFor: (app) => {
      const idx = get().focusOrder.indexOf(app);
      return 20 + (idx < 0 ? 0 : idx);
    },

    setAppMaximized: (app, maximized) => {
      const win = get().apps[app];
      if (!win.open) return;
      set({
        apps: patchApp(get().apps, app, {
          maximized,
          minimized: false,
        }),
        focusOrder: bringToFront(get().focusOrder, app),
      });
    },

    setAppFrame: (app, frame) => {
      set({
        frames: { ...get().frames, [app]: frame },
        frameRevision: get().frameRevision + 1,
      });
    },

    launchApp: (app, opts) => {
      const target = get().target;
      if (!target) return;
      const sessionId = isSshDesktopTarget(target) ? target.sessionId : null;
      // Local app providers are connected in subsequent implementation tasks.
      // Until then, never let a Local click fall through to the active SSH session.
      if (target.kind === "local" && ["files", "processes", "browser", "aiLinux"].includes(app)) return;

      if (app === "files") {
        const tab = opts?.filesTab ?? get().filesTab;
        const focusSearch = tab === "find";
        set({
          filesTab: focusSearch ? "find" : "files",
          apps: patchApp(get().apps, "files", {
            open: true,
            minimized: false,
            maximized: false,
          }),
          focusOrder: bringToFront(get().focusOrder, "files"),
        });
        if (sessionId) {
          useLocalFsStore.getState().openPanel(sessionId, "files");
          useFindStore.getState().activateSession(sessionId);
        }
        if (focusSearch) {
          useFindStore.setState((s) => ({
            focusNonce: s.focusNonce + 1,
          }));
        }
        return;
      }

      if (app === "processes") {
        set({
          apps: patchApp(get().apps, "processes", {
            open: true,
            minimized: false,
            maximized: false,
          }),
          focusOrder: bringToFront(get().focusOrder, "processes"),
        });
        useTaskManagerStore.setState({ open: true });
        return;
      }

      if (app === "terminal" || app === "aiLinux" || app === "markwisely") {
        set({
          apps: patchApp(get().apps, app, {
            open: true,
            minimized: false,
            maximized: false,
          }),
          focusOrder: bringToFront(get().focusOrder, app),
        });
        if (app === "aiLinux" && sessionId) bindDesktopAi(sessionId);
        return;
      }

      set({
        apps: patchApp(get().apps, "browser", {
          open: true,
          minimized: false,
          maximized: false,
        }),
        focusOrder: bringToFront(get().focusOrder, "browser"),
      });
      if (sessionId) void useBrowserStore.getState().openPanel(sessionId);
    },

    minimizeApp: (app) => {
      if (app === "browser") {
        void useBrowserStore.getState().minimize();
      }
      set({
        apps: patchApp(get().apps, app, { minimized: true }),
      });
    },

    restoreApp: (app) => {
      if (app === "browser") {
        void useBrowserStore.getState().restore();
      }
      if (app === "aiLinux") {
        const sessionId = get().sessionId;
        if (sessionId) bindDesktopAi(sessionId);
      }
      set({
        apps: patchApp(get().apps, app, {
          open: true,
          minimized: false,
        }),
        focusOrder: bringToFront(get().focusOrder, app),
      });
    },

    closeApp: (app) => {
      if (app === "files") {
        useLocalFsStore.setState({ open: false });
      } else if (app === "processes") {
        useTaskManagerStore.getState().close();
      } else if (app === "browser") {
        void useBrowserStore.getState().close();
      } else if (app === "aiLinux") {
        parkDesktopAi();
      }
      set({
        apps: patchApp(get().apps, app, {
          open: false,
          minimized: false,
          maximized: false,
        }),
        focusOrder: get().focusOrder.filter((id) => id !== app),
      });
    },

    toggleDockApp: (app) => {
      const win = get().apps[app];
      if (!win.open) {
        get().launchApp(app);
        return;
      }
      if (win.minimized) {
        get().restoreApp(app);
        return;
      }
      get().focusApp(app);
    },

    applySessionUi: (ui) => {
      const sessionId = get().sessionId;
      if (!sessionId) return;
      const apps = cloneDesktopApps(ui.apps);
      set({
        apps,
        frames: ui.frames ? { ...ui.frames } : {},
        focusOrder: [...ui.focusOrder],
        filesTab: ui.filesTab,
      });
      if (apps.aiLinux.open) bindDesktopAi(sessionId);
      else parkDesktopAi();

      const files = apps.files;
      if (files.open) {
        useLocalFsStore.getState().openPanel(sessionId, "files");
        useFindStore.getState().activateSession(sessionId);
        if (files.minimized) {
          useLocalFsStore.setState({ open: false });
        }
        if (ui.filesTab === "find") {
          useFindStore.setState((s) => ({ focusNonce: s.focusNonce + 1 }));
        }
      }

      const processes = apps.processes;
      if (processes.open) {
        useTaskManagerStore.setState({ open: !processes.minimized });
      }

      const browser = apps.browser;
      if (browser.open) {
        void (async () => {
          await useBrowserStore.getState().openPanel(sessionId);
          if (browser.minimized) {
            await useBrowserStore.getState().minimize();
          }
        })();
      }
    },
  };
});

/** Sync browser minimize/close into desktop dock badges when desktop is open. */
export function syncDesktopBrowserFromStore() {
  const desktop = useDesktopStore.getState();
  if (!desktop.open) return;
  const browser = useBrowserStore.getState();
  const cur = desktop.apps.browser;
  if (!browser.open && cur.open) {
    useDesktopStore.setState({
      apps: patchApp(desktop.apps, "browser", {
        open: false,
        minimized: false,
        maximized: false,
      }),
      focusOrder: desktop.focusOrder.filter((id) => id !== "browser"),
    });
    return;
  }
  if (browser.open) {
    const nextMin = browser.minimized;
    if (!cur.open || cur.minimized !== nextMin) {
      useDesktopStore.setState({
        apps: patchApp(desktop.apps, "browser", {
          open: true,
          minimized: nextMin,
          maximized: cur.maximized,
        }),
        focusOrder: cur.open
          ? desktop.focusOrder
          : bringToFront(desktop.focusOrder, "browser"),
      });
    }
  }
}

useBrowserStore.subscribe(() => {
  syncDesktopBrowserFromStore();
});

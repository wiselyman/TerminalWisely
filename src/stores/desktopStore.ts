import { create } from "zustand";
import {
  readWorkspacePanelWidth,
  setWorkspacePanelWidth,
  subscribeWorkspacePanelWidth,
} from "../lib/workspacePanelWidth";
import { bindDesktopAi, parkDesktopAi } from "../lib/desktopAiBridge";
import type { DesktopWindowFrame } from "../lib/desktopWindowFrame";
import { useBrowserStore } from "./browserStore";
import { useFindStore } from "./findStore";
import { useLocalFsStore } from "./localFsStore";
import { useTaskManagerStore } from "./taskManagerStore";

export type DesktopAppId =
  | "files"
  | "processes"
  | "browser"
  | "terminal"
  | "aiLinux";

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
  subscribeWorkspacePanelWidth((width) => {
    set({ width });
  });

  return {
    open: false,
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
      useLocalFsStore.getState().setActiveTab("files");
      if (tab === "find") {
        useFindStore.setState((s) => ({
          focusNonce: s.focusNonce + 1,
        }));
      }
    },

    openDesktop: (sessionId) => {
      set({
        open: true,
        sessionId,
      });
      useLocalFsStore.getState().activateSession(sessionId);
      useFindStore.getState().activateSession(sessionId);
    },

    close: () => {
      const { apps } = get();
      // Always park native browser if any session still owns a surface —
      // apps.browser.open can lag behind async close during host tab switches.
      if (apps.browser.open || useBrowserStore.getState().webviewLabel) {
        void useBrowserStore.getState().close();
      }
      if (apps.files.open) {
        useLocalFsStore.getState().close();
      }
      if (apps.processes.open) {
        useTaskManagerStore.getState().close();
      }
      parkDesktopAi();
      set({
        open: false,
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
      const sessionId = get().sessionId;
      if (!sessionId) return;

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
        useLocalFsStore.getState().openPanel(sessionId, "files");
        useFindStore.getState().activateSession(sessionId);
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

      if (app === "terminal" || app === "aiLinux") {
        set({
          apps: patchApp(get().apps, app, {
            open: true,
            minimized: false,
            maximized: false,
          }),
          focusOrder: bringToFront(get().focusOrder, app),
        });
        if (app === "aiLinux") bindDesktopAi(sessionId);
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
      void useBrowserStore.getState().openPanel(sessionId);
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

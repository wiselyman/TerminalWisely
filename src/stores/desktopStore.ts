import { create } from "zustand";
import {
  readWorkspacePanelWidth,
  setWorkspacePanelWidth,
  subscribeWorkspacePanelWidth,
} from "../lib/workspacePanelWidth";
import { useBrowserStore } from "./browserStore";
import { useFindStore } from "./findStore";
import { useLocalFsStore } from "./localFsStore";
import { useTaskManagerStore } from "./taskManagerStore";

export type DesktopAppId = "files" | "processes" | "browser";

export interface DesktopAppWindow {
  open: boolean;
  minimized: boolean;
  /** When true, float fills the whole TW app (like Markdown maximize). */
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
  };
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
  focusApp: (app: DesktopAppId) => void;
  /** Dock click: launch, restore, or focus. */
  toggleDockApp: (app: DesktopAppId) => void;
  zIndexFor: (app: DesktopAppId) => number;
  /** Re-open apps after host tab restore (does not change sessionId). */
  applySessionUi: (ui: {
    apps: AppsState;
    focusOrder: DesktopAppId[];
    filesTab: "files" | "find";
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
      set({
        open: false,
        sessionId: null,
        apps: idleApps(),
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
      set({
        apps: {
          files: { ...ui.apps.files },
          processes: { ...ui.apps.processes },
          browser: { ...ui.apps.browser },
        },
        focusOrder: [...ui.focusOrder],
        filesTab: ui.filesTab,
      });

      const files = ui.apps.files;
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

      const processes = ui.apps.processes;
      if (processes.open) {
        useTaskManagerStore.setState({ open: !processes.minimized });
      }

      const browser = ui.apps.browser;
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

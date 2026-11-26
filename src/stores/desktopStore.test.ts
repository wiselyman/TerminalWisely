import { beforeEach, describe, expect, it, vi } from "vitest";

const openPanel = vi.fn();
const localFsClose = vi.fn();
const activateLocalFs = vi.fn();
const setActiveTab = vi.fn();
const activateFind = vi.fn();
const localFsSetState = vi.fn();
const taskClose = vi.fn();
const browserOpenPanel = vi.fn();
const browserOpenForTarget = vi.fn();
const browserMinimize = vi.fn();
const browserRestore = vi.fn();
const browserClose = vi.fn();

vi.mock("../lib/workspacePanelWidth", () => ({
  readWorkspacePanelWidth: () => 420,
  setWorkspacePanelWidth: (w: number) => w,
  subscribeWorkspacePanelWidth: () => () => {},
}));

vi.mock("./localFsStore", () => ({
  useLocalFsStore: {
    getState: () => ({
      openPanel,
      close: localFsClose,
      activateSession: activateLocalFs,
      setActiveTab,
    }),
    setState: localFsSetState,
  },
}));

vi.mock("./findStore", () => ({
  useFindStore: {
    getState: () => ({
      activateSession: activateFind,
      close: vi.fn(),
    }),
    setState: vi.fn(),
  },
}));

vi.mock("./taskManagerStore", () => ({
  useTaskManagerStore: {
    getState: () => ({
      close: taskClose,
    }),
    setState: vi.fn(),
  },
}));

vi.mock("./browserStore", () => {
  const state = {
    open: false,
    minimized: false,
    openPanel: browserOpenPanel,
    openForTarget: browserOpenForTarget,
    minimize: browserMinimize,
    restore: browserRestore,
    close: browserClose,
  };
  return {
    useBrowserStore: {
      getState: () => state,
      setState: (patch: Partial<typeof state>) => Object.assign(state, patch),
      subscribe: () => () => {},
    },
  };
});

describe("desktopStore", () => {
  beforeEach(async () => {
    vi.resetModules();
    openPanel.mockClear();
    localFsClose.mockClear();
    activateLocalFs.mockClear();
    setActiveTab.mockClear();
    activateFind.mockClear();
    localFsSetState.mockClear();
    taskClose.mockClear();
    browserOpenPanel.mockClear();
    browserOpenForTarget.mockClear();
    browserMinimize.mockClear();
    browserRestore.mockClear();
    browserClose.mockClear();
  });

  it("openDesktop + launch/minimize/restore files app", async () => {
    const { useDesktopStore } = await import("./desktopStore");
    useDesktopStore.getState().openDesktop("sess-1");
    expect(useDesktopStore.getState().open).toBe(true);
    expect(activateLocalFs).toHaveBeenCalledWith("sess-1");

    useDesktopStore.getState().launchApp("files", { filesTab: "find" });
    expect(useDesktopStore.getState().apps.files.open).toBe(true);
    expect(useDesktopStore.getState().apps.files.maximized).toBe(false);
    expect(useDesktopStore.getState().filesTab).toBe("find");
    expect(openPanel).toHaveBeenCalledWith("sess-1", "files");

    const originalFrame = { x: 32, y: 48, width: 640, height: 420 };
    useDesktopStore.getState().setAppFrame("files", originalFrame);
    useDesktopStore.getState().setAppMaximized("files", true);
    expect(useDesktopStore.getState().apps.files.maximized).toBe(true);
    useDesktopStore.getState().minimizeApp("files");
    expect(useDesktopStore.getState().apps.files.minimized).toBe(true);
    expect(useDesktopStore.getState().apps.files.maximized).toBe(false);

    useDesktopStore.getState().toggleDockApp("files");
    expect(useDesktopStore.getState().apps.files.minimized).toBe(false);
    expect(useDesktopStore.getState().apps.files.maximized).toBe(false);
    expect(useDesktopStore.getState().frames.files).toEqual(originalFrame);
  });

  it("launch processes and browser via dock toggle", async () => {
    const { useDesktopStore } = await import("./desktopStore");
    useDesktopStore.getState().openDesktop("sess-2");
    useDesktopStore.getState().toggleDockApp("processes");
    expect(useDesktopStore.getState().apps.processes.open).toBe(true);
    expect(useDesktopStore.getState().apps.processes.maximized).toBe(false);

    useDesktopStore.getState().toggleDockApp("browser");
    expect(useDesktopStore.getState().apps.browser.open).toBe(true);
    expect(useDesktopStore.getState().apps.browser.maximized).toBe(false);
    expect(browserOpenForTarget).toHaveBeenCalledWith({ kind: "ssh", sessionId: "sess-2" });
  });

  it("launches terminal and AI Linux on the same desktop session", async () => {
    const { useDesktopStore } = await import("./desktopStore");
    useDesktopStore.getState().openDesktop("sess-2");
    useDesktopStore.getState().toggleDockApp("terminal");
    useDesktopStore.getState().toggleDockApp("aiLinux");
    expect(useDesktopStore.getState().sessionId).toBe("sess-2");
    expect(useDesktopStore.getState().apps.terminal.open).toBe(true);
    expect(useDesktopStore.getState().apps.aiLinux.open).toBe(true);
    useDesktopStore.getState().close();
    expect(useDesktopStore.getState().open).toBe(false);
    expect(useDesktopStore.getState().apps.terminal.open).toBe(false);
  });

  it("launches AI Local only for Home Desktop", async () => {
    const { useDesktopStore } = await import("./desktopStore");
    useDesktopStore.getState().openDesktopTarget({ kind: "local" });
    useDesktopStore.getState().toggleDockApp("aiLocal");
    expect(useDesktopStore.getState().apps.aiLocal.open).toBe(true);
    expect(useDesktopStore.getState().apps.aiLinux.open).toBe(false);

    useDesktopStore.getState().openDesktop("host-ai");
    expect(useDesktopStore.getState().apps.aiLocal.open).toBe(false);
    useDesktopStore.getState().toggleDockApp("aiLocal");
    expect(useDesktopStore.getState().apps.aiLocal.open).toBe(false);
    useDesktopStore.getState().toggleDockApp("aiLinux");
    expect(useDesktopStore.getState().apps.aiLinux.open).toBe(true);
  });

  it("launches FileWisely instead of falling through to Browser", async () => {
    const { useDesktopStore } = await import("./desktopStore");
    useDesktopStore.getState().openDesktop("sess-markdown");
    useDesktopStore.getState().toggleDockApp("filewisely");

    expect(useDesktopStore.getState().apps.filewisely.open).toBe(true);
    expect(useDesktopStore.getState().apps.browser.open).toBe(false);
    expect(browserOpenPanel).not.toHaveBeenCalled();
  });

  it("launches the unified FileWisely app", async () => {
    const { useDesktopStore } = await import("./desktopStore");
    useDesktopStore.getState().openDesktopTarget({ kind: "local" });
    useDesktopStore.getState().toggleDockApp("filewisely");
    expect(useDesktopStore.getState().apps.filewisely).toMatchObject({ open: true, minimized: false });
  });

  it("restores the FileWisely window for Local and each SSH target", async () => {
    const { useDesktopStore } = await import("./desktopStore");
    useDesktopStore.getState().openDesktopTarget({ kind: "local" });
    expect(activateLocalFs).not.toHaveBeenCalled();
    useDesktopStore.getState().toggleDockApp("filewisely");
    useDesktopStore.getState().setAppMaximized("filewisely", true);

    useDesktopStore.getState().openDesktopTarget({ kind: "ssh", sessionId: "host-a" });
    expect(useDesktopStore.getState().apps.files.open).toBe(false);
    useDesktopStore.getState().toggleDockApp("processes");

    useDesktopStore.getState().openDesktopTarget({ kind: "ssh", sessionId: "host-b" });
    expect(useDesktopStore.getState().apps.processes.open).toBe(false);
    useDesktopStore.getState().toggleDockApp("browser");

    useDesktopStore.getState().openDesktopTarget({ kind: "local" });
    expect(useDesktopStore.getState().apps.filewisely).toEqual({
      open: true,
      minimized: false,
      maximized: true,
    });
    expect(useDesktopStore.getState().sessionId).toBeNull();
    expect(useDesktopStore.getState().apps.processes.open).toBe(false);

    useDesktopStore.getState().openDesktopTarget({ kind: "ssh", sessionId: "host-a" });
    expect(useDesktopStore.getState().apps.processes.open).toBe(true);
    expect(useDesktopStore.getState().apps.browser.open).toBe(false);

    useDesktopStore.getState().openDesktopTarget({ kind: "ssh", sessionId: "host-b" });
    expect(useDesktopStore.getState().apps.browser.open).toBe(true);
    expect(useDesktopStore.getState().apps.files.open).toBe(false);
  });

  it("does not close SSH file state when closing the Local Files window", async () => {
    const { useDesktopStore } = await import("./desktopStore");
    useDesktopStore.getState().openDesktopTarget({ kind: "local" });
    useDesktopStore.getState().launchApp("files");
    useDesktopStore.getState().closeApp("files");
    expect(useDesktopStore.getState().apps.files.open).toBe(false);
    expect(localFsSetState).not.toHaveBeenCalled();
  });
});

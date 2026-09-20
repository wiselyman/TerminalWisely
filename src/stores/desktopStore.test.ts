import { beforeEach, describe, expect, it, vi } from "vitest";

const openPanel = vi.fn();
const localFsClose = vi.fn();
const activateLocalFs = vi.fn();
const setActiveTab = vi.fn();
const activateFind = vi.fn();
const taskClose = vi.fn();
const browserOpenPanel = vi.fn();
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
    setState: vi.fn(),
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
    taskClose.mockClear();
    browserOpenPanel.mockClear();
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

    useDesktopStore.getState().setAppMaximized("files", true);
    expect(useDesktopStore.getState().apps.files.maximized).toBe(true);
    useDesktopStore.getState().setAppMaximized("files", false);
    expect(useDesktopStore.getState().apps.files.maximized).toBe(false);

    useDesktopStore.getState().minimizeApp("files");
    expect(useDesktopStore.getState().apps.files.minimized).toBe(true);

    useDesktopStore.getState().toggleDockApp("files");
    expect(useDesktopStore.getState().apps.files.minimized).toBe(false);
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
    expect(browserOpenPanel).toHaveBeenCalledWith("sess-2");
  });
});

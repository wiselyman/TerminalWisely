import { beforeEach, describe, expect, it, vi } from "vitest";

const panelState = {
  aiOpen: false,
  aiSessionId: null as string | null,
  desktopOpen: false,
  localFsOpen: false,
};

let sessionActiveTabId: string | null = "sess-1";

const closeAi = vi.fn();
const bindManagedEntity = vi.fn();
const closeLocalFs = vi.fn();
const openPanel = vi.fn();
const closeTask = vi.fn();
const closeFind = vi.fn();
const closeDesktop = vi.fn();
const openDesktop = vi.fn();
const launchApp = vi.fn();
const toggleDockApp = vi.fn();
const aiSetState = vi.fn((patch: { open?: boolean }) => {
  if (typeof patch.open === "boolean") panelState.aiOpen = patch.open;
});

vi.mock("./aiEngineerStore", () => ({
  useAiEngineerStore: {
    getState: () => ({
      get open() {
        return panelState.aiOpen;
      },
      get sessionId() {
        return panelState.aiSessionId;
      },
      close: closeAi,
      bindManagedEntity,
    }),
    setState: aiSetState,
  },
}));

vi.mock("./desktopStore", () => ({
  useDesktopStore: {
    getState: () => ({
      get open() {
        return panelState.desktopOpen;
      },
      close: closeDesktop,
      openDesktop,
      launchApp,
      toggleDockApp,
    }),
  },
}));

vi.mock("./localFsStore", () => ({
  useLocalFsStore: {
    getState: () => ({
      get open() {
        return panelState.localFsOpen;
      },
      close: closeLocalFs,
      openPanel,
    }),
  },
}));

vi.mock("./taskManagerStore", () => ({
  useTaskManagerStore: {
    getState: () => ({
      open: false,
      close: closeTask,
    }),
    setState: vi.fn(),
  },
}));

vi.mock("./findStore", () => ({
  useFindStore: {
    getState: () => ({
      open: false,
      close: closeFind,
      openFind: vi.fn(),
      activateSession: vi.fn(),
    }),
  },
}));

vi.mock("./browserStore", () => ({
  useBrowserStore: {
    getState: () => ({
      open: false,
      minimized: false,
      minimize: vi.fn(),
      close: vi.fn(),
      openPanel: vi.fn(),
      restore: vi.fn(),
    }),
  },
}));

vi.mock("./sessionStore", () => ({
  useSessionStore: {
    getState: () => ({
      activeTabId: sessionActiveTabId,
    }),
  },
}));

vi.mock("react-dom", () => ({
  unstable_batchedUpdates: (fn: () => void) => fn(),
}));

describe("workspace panel switching", () => {
  beforeEach(() => {
    panelState.aiOpen = false;
    panelState.aiSessionId = null;
    panelState.desktopOpen = false;
    panelState.localFsOpen = false;
    sessionActiveTabId = "sess-1";
    closeAi.mockClear();
    bindManagedEntity.mockClear();
    closeLocalFs.mockClear();
    openPanel.mockClear();
    closeDesktop.mockClear();
    openDesktop.mockClear();
    launchApp.mockClear();
    toggleDockApp.mockClear();
    aiSetState.mockClear();
  });

  it("closes desktop when opening AI from the titlebar", async () => {
    panelState.desktopOpen = true;
    const { switchToAiEngineerPanel } = await import("./workspacePanelSwitch");
    switchToAiEngineerPanel({
      kind: "server",
      id: "u@h:22",
      label: "spark-remote",
      sessionId: "sess-1",
      serverId: "u@h:22",
    });
    expect(closeDesktop).toHaveBeenCalled();
    expect(bindManagedEntity).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "sess-1" }),
      expect.objectContaining({ open: true }),
    );
  });

  it("switchWorkspacePanel to desktop closes AI", async () => {
    panelState.aiOpen = true;
    const { switchWorkspacePanel } = await import("./workspacePanelSwitch");
    switchWorkspacePanel("desktop", "sess-1");
    expect(closeAi).toHaveBeenCalled();
    expect(openDesktop).toHaveBeenCalledWith("sess-1");
  });

  it("legacy localFs find opens desktop + files find tab", async () => {
    const { switchWorkspacePanel } = await import("./workspacePanelSwitch");
    switchWorkspacePanel("localFs", "sess-1", undefined, "find");
    expect(openDesktop).toHaveBeenCalledWith("sess-1");
    expect(launchApp).toHaveBeenCalledWith("files", { filesTab: "find" });
  });

  it("revealAiEngineerPanel refuses to reopen parked host chat on another tab", async () => {
    panelState.aiOpen = false;
    panelState.aiSessionId = "bonsai-sess";
    sessionActiveTabId = "spark-sess";
    const { revealAiEngineerPanel } = await import("./workspacePanelSwitch");
    revealAiEngineerPanel();
    expect(aiSetState).not.toHaveBeenCalled();
  });

  it("revealAiEngineerPanel reopens when AI session matches active tab", async () => {
    panelState.aiOpen = false;
    panelState.aiSessionId = "spark-sess";
    sessionActiveTabId = "spark-sess";
    const { revealAiEngineerPanel } = await import("./workspacePanelSwitch");
    revealAiEngineerPanel();
    expect(aiSetState).toHaveBeenCalledWith({ open: true });
  });
});

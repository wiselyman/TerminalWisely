import { beforeEach, describe, expect, it, vi } from "vitest";

const panelState = {
  aiOpen: false,
  localFsOpen: false,
};

const closeAi = vi.fn();
const bindManagedEntity = vi.fn();
const closeLocalFs = vi.fn();
const openPanel = vi.fn();
const closeTask = vi.fn();
const closeFind = vi.fn();

vi.mock("./aiEngineerStore", () => ({
  useAiEngineerStore: {
    getState: () => ({
      get open() {
        return panelState.aiOpen;
      },
      close: closeAi,
      bindManagedEntity,
    }),
    setState: vi.fn(),
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
    }),
  },
}));

vi.mock("react-dom", () => ({
  unstable_batchedUpdates: (fn: () => void) => fn(),
}));

describe("workspace panel switching", () => {
  beforeEach(() => {
    panelState.aiOpen = false;
    panelState.localFsOpen = false;
    closeAi.mockClear();
    bindManagedEntity.mockClear();
    closeLocalFs.mockClear();
    openPanel.mockClear();
  });

  it("closes LocalFs when opening AI from the titlebar", async () => {
    panelState.localFsOpen = true;
    const { switchToAiEngineerPanel } = await import("./workspacePanelSwitch");
    switchToAiEngineerPanel({
      kind: "server",
      id: "u@h:22",
      label: "spark-remote",
      sessionId: "sess-1",
      serverId: "u@h:22",
    });
    expect(closeLocalFs).toHaveBeenCalled();
    expect(bindManagedEntity).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "sess-1" }),
      expect.objectContaining({ open: true }),
    );
  });

  it("switchWorkspacePanel to localFs closes AI", async () => {
    panelState.aiOpen = true;
    const { switchWorkspacePanel } = await import("./workspacePanelSwitch");
    switchWorkspacePanel("localFs", "sess-1");
    expect(closeAi).toHaveBeenCalled();
    expect(openPanel).toHaveBeenCalledWith("sess-1", undefined);
  });
});

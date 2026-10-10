/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const closeLocalFs = vi.fn();
const closeTask = vi.fn();
const closeFind = vi.fn();
const closeAi = vi.fn();
const bindManagedEntity = vi.fn();
const setEngineerMode = vi.fn();
const focusManaged = vi.fn();
const leaveHome = vi.fn();
const openHome = vi.fn();

vi.mock("./localFsStore", () => ({
  useLocalFsStore: {
    getState: () => ({ close: closeLocalFs }),
  },
}));

vi.mock("./taskManagerStore", () => ({
  useTaskManagerStore: {
    getState: () => ({ close: closeTask }),
  },
}));

vi.mock("./findStore", () => ({
  useFindStore: {
    getState: () => ({ close: closeFind }),
  },
}));

vi.mock("./aiEngineerStore", () => ({
  useAiEngineerStore: {
    getState: () => ({
      setEngineerMode,
      bindManagedEntity,
      close: closeAi,
    }),
    setState: vi.fn(),
  },
}));

vi.mock("./managedEntityStore", () => ({
  useManagedEntityStore: {
    getState: () => ({
      focused: focusManaged,
      leaveHome,
      openHome,
    }),
  },
}));

vi.mock("./k8sStore", () => ({
  useK8sStore: {
    getState: () => ({
      selectedCluster: null,
    }),
  },
}));

describe("sidebarViewStore setView", () => {
  beforeEach(() => {
    closeLocalFs.mockClear();
    closeTask.mockClear();
    closeFind.mockClear();
    closeAi.mockClear();
    bindManagedEntity.mockClear();
    setEngineerMode.mockClear();
    focusManaged.mockReset();
    focusManaged.mockReturnValue(null);
    leaveHome.mockClear();
    openHome.mockClear();
    localStorage.clear();
    vi.resetModules();
  });

  it("opens on the hosts list when the saved view is the database workbench", async () => {
    localStorage.setItem("tw.sidebar.view", "db");
    const { useSidebarViewStore } = await import("./sidebarViewStore");
    expect(useSidebarViewStore.getState().view).toBe("hosts");
  });

  it("closes hosts LocalFs panel when switching to k8s", async () => {
    const { useSidebarViewStore } = await import("./sidebarViewStore");
    useSidebarViewStore.getState().setView("k8s");
    expect(closeLocalFs).toHaveBeenCalled();
    expect(closeTask).toHaveBeenCalled();
    expect(closeFind).toHaveBeenCalled();
    expect(closeAi).toHaveBeenCalled();
    expect(setEngineerMode).toHaveBeenCalledWith("k8s");
    expect(openHome).toHaveBeenCalled();
  });

  it("switches to db without binding a host", async () => {
    const { useSidebarViewStore } = await import("./sidebarViewStore");
    useSidebarViewStore.getState().setView("db");
    expect(closeLocalFs).toHaveBeenCalled();
    expect(setEngineerMode).toHaveBeenCalledWith("db");
    expect(bindManagedEntity).not.toHaveBeenCalled();
    // Stay on Home until a connection/workspace is opened.
    expect(leaveHome).not.toHaveBeenCalled();
  });

  it("binds focused cluster AI when switching to k8s with focus", async () => {
    focusManaged.mockImplementation((kind: string) =>
      kind === "cluster"
        ? { kind: "cluster", id: "c1", label: "prod" }
        : null,
    );
    const { useSidebarViewStore } = await import("./sidebarViewStore");
    useSidebarViewStore.getState().setView("k8s");
    expect(bindManagedEntity).toHaveBeenCalledWith({
      kind: "cluster",
      id: "c1",
      label: "prod",
    });
    expect(closeAi).not.toHaveBeenCalled();
  });
});

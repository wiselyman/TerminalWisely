/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const closeLocalFs = vi.fn();
const closeTask = vi.fn();
const closeFind = vi.fn();
const closeAi = vi.fn();
const bindManagedEntity = vi.fn();
const setEngineerMode = vi.fn();
const focusManaged = vi.fn();

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
  },
}));

vi.mock("./managedEntityStore", () => ({
  useManagedEntityStore: {
    getState: () => ({
      focused: focusManaged,
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
    localStorage.clear();
    vi.resetModules();
  });

  it("closes hosts LocalFs panel when switching to k8s", async () => {
    const { useSidebarViewStore } = await import("./sidebarViewStore");
    useSidebarViewStore.getState().setView("k8s");
    expect(closeLocalFs).toHaveBeenCalled();
    expect(closeTask).toHaveBeenCalled();
    expect(closeFind).toHaveBeenCalled();
    expect(closeAi).toHaveBeenCalled();
    expect(setEngineerMode).toHaveBeenCalledWith("k8s");
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

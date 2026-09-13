/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

describe("localFsStore.openDirectory / navigation", () => {
  beforeEach(() => {
    invoke.mockReset();
    localStorage.clear();
    vi.resetModules();
  });

  it("openDirectory sets contentsPath and caches children without expanding tree", async () => {
    const { useLocalFsStore } = await import("./localFsStore");
    useLocalFsStore.setState({
      open: true,
      sessionId: "s1",
      rootPath: "/home/u",
      rootLabel: "~",
      childrenCache: {
        "/home/u": [
          {
            name: "docs",
            path: "/home/u/docs",
            kind: "directory",
          },
        ],
      },
      expandedPaths: ["/home/u"],
      loadingPaths: [],
      loadingRoot: false,
      error: null,
      showHidden: false,
      contentsPath: "/home/u",
      contentsHistory: [],
      selectedPath: "/home/u",
      selectedPaths: ["/home/u"],
      selectionAnchor: "/home/u",
    });

    invoke.mockResolvedValueOnce({
      path: "/home/u/docs",
      entries: [
        {
          name: "a.txt",
          path: "/home/u/docs/a.txt",
          kind: "file",
          size_bytes: 3,
        },
      ],
    });

    await useLocalFsStore.getState().openDirectory("/home/u/docs");

    const state = useLocalFsStore.getState();
    expect(state.contentsPath).toBe("/home/u/docs");
    expect(state.selectedPath).toBe("/home/u/docs");
    expect(state.expandedPaths).toEqual(["/home/u"]);
    expect(state.expandedPaths).not.toContain("/home/u/docs");
    expect(state.contentsHistory).toEqual(["/home/u"]);
    expect(state.childrenCache["/home/u/docs"]?.map((e) => e.name)).toEqual([
      "a.txt",
    ]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("goBack restores previous contentsPath without re-pushing history", async () => {
    const { useLocalFsStore } = await import("./localFsStore");
    useLocalFsStore.setState({
      open: true,
      sessionId: "s1",
      rootPath: "/home/u",
      rootLabel: "~",
      childrenCache: {
        "/home/u": [{ name: "docs", path: "/home/u/docs", kind: "directory" }],
        "/home/u/docs": [
          { name: "a.txt", path: "/home/u/docs/a.txt", kind: "file" },
        ],
      },
      expandedPaths: ["/home/u"],
      loadingPaths: [],
      loadingRoot: false,
      error: null,
      showHidden: false,
      contentsPath: "/home/u/docs",
      contentsHistory: ["/home/u"],
      selectedPath: "/home/u/docs",
      selectedPaths: ["/home/u/docs"],
      selectionAnchor: "/home/u/docs",
    });

    await useLocalFsStore.getState().goBack();

    const state = useLocalFsStore.getState();
    expect(state.contentsPath).toBe("/home/u");
    expect(state.contentsHistory).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("goUp opens parent directory", async () => {
    const { useLocalFsStore } = await import("./localFsStore");
    useLocalFsStore.setState({
      open: true,
      sessionId: "s1",
      rootPath: "/",
      rootLabel: "/",
      childrenCache: {
        "/": [{ name: "home", path: "/home", kind: "directory" }],
        "/home": [{ name: "u", path: "/home/u", kind: "directory" }],
        "/home/u": [],
      },
      expandedPaths: ["/"],
      loadingPaths: [],
      loadingRoot: false,
      error: null,
      showHidden: false,
      contentsPath: "/home/u",
      contentsHistory: [],
      selectedPath: "/home/u",
      selectedPaths: ["/home/u"],
      selectionAnchor: "/home/u",
    });

    await useLocalFsStore.getState().goUp();

    const state = useLocalFsStore.getState();
    expect(state.contentsPath).toBe("/home");
    expect(state.contentsHistory).toEqual(["/home/u"]);
  });

  it("setViewMode persists to localStorage", async () => {
    const { useLocalFsStore } = await import("./localFsStore");
    useLocalFsStore.getState().setViewMode("grid");
    expect(localStorage.getItem("tw.localFs.viewMode")).toBe("grid");
    expect(useLocalFsStore.getState().viewMode).toBe("grid");
    useLocalFsStore.getState().setViewMode("list");
    expect(localStorage.getItem("tw.localFs.viewMode")).toBe("list");
  });
});

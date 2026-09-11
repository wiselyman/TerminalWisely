/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

describe("localFsStore.reloadDirectory", () => {
  beforeEach(() => {
    invoke.mockReset();
    localStorage.clear();
    vi.resetModules();
  });

  it("re-fetches one dir into childrenCache and expands it", async () => {
    const { useLocalFsStore } = await import("./localFsStore");
    useLocalFsStore.setState({
      open: true,
      sessionId: "s1",
      rootPath: "/home/u",
      rootLabel: "~",
      childrenCache: {
        "/home/u": [
          {
            name: "old",
            path: "/home/u/old",
            kind: "directory",
          },
        ],
      },
      expandedPaths: ["/home/u"],
      loadingPaths: [],
      loadingRoot: false,
      error: null,
      showHidden: false,
    });

    invoke.mockResolvedValueOnce({
      path: "/home/u",
      entries: [
        {
          name: "old",
          path: "/home/u/old",
          kind: "directory",
        },
        {
          name: "newdir",
          path: "/home/u/newdir",
          kind: "directory",
        },
      ],
    });

    await useLocalFsStore.getState().reloadDirectory("/home/u", {
      ensureExpanded: true,
    });

    expect(invoke).toHaveBeenCalledWith("list_remote_directory", {
      request: {
        session_id: "s1",
        path: "/home/u",
        show_hidden: false,
      },
    });

    const state = useLocalFsStore.getState();
    expect(state.childrenCache["/home/u"]?.map((e) => e.name)).toEqual([
      "old",
      "newdir",
    ]);
    expect(state.expandedPaths).toContain("/home/u");
    expect(state.loadingRoot).toBe(false);
  });

  it("does not wipe sibling directory caches", async () => {
    const { useLocalFsStore } = await import("./localFsStore");
    useLocalFsStore.setState({
      open: true,
      sessionId: "s1",
      rootPath: "/home/u",
      childrenCache: {
        "/home/u": [],
        "/home/u/other": [
          {
            name: "keep",
            path: "/home/u/other/keep",
            kind: "file",
          },
        ],
      },
      expandedPaths: ["/home/u", "/home/u/other"],
      loadingPaths: [],
      showHidden: false,
    });

    invoke.mockResolvedValueOnce({
      path: "/home/u/docs",
      entries: [
        {
          name: "fresh",
          path: "/home/u/docs/fresh",
          kind: "directory",
        },
      ],
    });

    await useLocalFsStore.getState().reloadDirectory("/home/u/docs");

    const state = useLocalFsStore.getState();
    expect(state.childrenCache["/home/u/other"]?.[0]?.name).toBe("keep");
    expect(state.childrenCache["/home/u/docs"]?.[0]?.name).toBe("fresh");
    expect(state.expandedPaths).toContain("/home/u/docs");
  });
});

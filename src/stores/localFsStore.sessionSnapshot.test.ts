/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

describe("localFsStore session path memory", () => {
  beforeEach(() => {
    invoke.mockReset();
    localStorage.clear();
    vi.resetModules();
  });

  it("activateSession restores contentsPath from the prior visit", async () => {
    const { useLocalFsStore } = await import("./localFsStore");
    useLocalFsStore.setState({
      open: true,
      sessionId: "firefly",
      rootPath: "/home/firefly",
      rootLabel: "~",
      childrenCache: {
        "/home/firefly": [
          { name: "Public", path: "/home/firefly/Public", kind: "directory" },
        ],
        "/home/firefly/Public": [],
      },
      expandedPaths: ["/home/firefly"],
      loadingPaths: [],
      loadingRoot: false,
      error: null,
      showHidden: false,
      contentsPath: "/home/firefly/Public",
      contentsHistory: ["/home/firefly"],
      selectedPath: "/home/firefly/Public",
      selectedPaths: ["/home/firefly/Public"],
      selectionAnchor: "/home/firefly/Public",
      clipboard: null,
      sessionSnapshots: {},
    });

    invoke.mockResolvedValue({
      path: "/home/other",
      entries: [],
    });

    useLocalFsStore.getState().activateSession("spark");
    expect(useLocalFsStore.getState().sessionId).toBe("spark");
    expect(useLocalFsStore.getState().sessionSnapshots.firefly?.contentsPath).toBe(
      "/home/firefly/Public",
    );
    // Cold host: loading, one SSH for ~
    expect(useLocalFsStore.getState().loadingRoot).toBe(true);

    invoke.mockClear();
    useLocalFsStore.getState().activateSession("firefly");
    const state = useLocalFsStore.getState();
    expect(state.sessionId).toBe("firefly");
    expect(state.contentsPath).toBe("/home/firefly/Public");
    expect(state.contentsHistory).toEqual(["/home/firefly"]);
    expect(state.rootPath).toBe("/home/firefly");
    // Warm cache: no SSH refresh on switch-back.
    expect(invoke).not.toHaveBeenCalled();
  });

  it("stale initTree result does not clobber another host", async () => {
    const { useLocalFsStore } = await import("./localFsStore");
    let resolveSpark: (v: unknown) => void = () => undefined;
    invoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSpark = resolve;
        }),
    );

    useLocalFsStore.setState({
      open: true,
      sessionId: null,
      sessionSnapshots: {},
      loadingRoot: false,
      rootPath: null,
      contentsPath: null,
      childrenCache: {},
      showHidden: false,
    });

    useLocalFsStore.getState().activateSession("spark");
    expect(useLocalFsStore.getState().loadingRoot).toBe(true);

    invoke.mockResolvedValue({
      path: "/home/firefly",
      entries: [{ name: "Documents", path: "/home/firefly/Documents", kind: "directory" }],
    });
    useLocalFsStore.getState().activateSession("firefly");
    // Wait for firefly init
    await vi.waitFor(() => {
      expect(useLocalFsStore.getState().rootPath).toBe("/home/firefly");
    });

    resolveSpark({
      path: "/home/spark",
      entries: [{ name: "x", path: "/home/spark/x", kind: "directory" }],
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(useLocalFsStore.getState().sessionId).toBe("firefly");
    expect(useLocalFsStore.getState().rootPath).toBe("/home/firefly");
    expect(useLocalFsStore.getState().rootPath).not.toBe("/home/spark");
  });

  it("close keeps a snapshot so reopen restores the path", async () => {
    const { useLocalFsStore } = await import("./localFsStore");
    useLocalFsStore.setState({
      open: true,
      sessionId: "firefly",
      rootPath: "/home/firefly",
      rootLabel: "~",
      childrenCache: { "/home/firefly": [] },
      expandedPaths: ["/home/firefly"],
      loadingPaths: [],
      loadingRoot: false,
      error: null,
      showHidden: false,
      contentsPath: "/home/firefly/Documents",
      contentsHistory: ["/home/firefly"],
      selectedPath: "/home/firefly/Documents",
      selectedPaths: ["/home/firefly/Documents"],
      selectionAnchor: "/home/firefly/Documents",
      clipboard: null,
      sessionSnapshots: {},
    });

    useLocalFsStore.getState().close();
    expect(useLocalFsStore.getState().open).toBe(false);
    expect(
      useLocalFsStore.getState().sessionSnapshots.firefly?.contentsPath,
    ).toBe("/home/firefly/Documents");

    invoke.mockResolvedValue({
      path: "/home/firefly/Documents",
      entries: [],
    });

    useLocalFsStore.getState().openPanel("firefly", "files");
    expect(useLocalFsStore.getState().open).toBe(true);
    expect(useLocalFsStore.getState().contentsPath).toBe(
      "/home/firefly/Documents",
    );
  });
});

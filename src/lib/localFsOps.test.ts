import { describe, expect, it } from "vitest";
import {
  canDropMove,
  dropMoveTargetDir,
  isSameOrDescendantPath,
  parentRemotePath,
  pasteTargetDir,
  rangeSelectPaths,
  togglePathInSelection,
} from "./localFsOps";

describe("localFsOps", () => {
  it("detects descendant destinations", () => {
    expect(isSameOrDescendantPath("/a/b", "/a/b/c")).toBe(true);
    expect(isSameOrDescendantPath("/a/b", "/a/bc")).toBe(false);
    expect(canDropMove(["/a/b"], "/a/b/c").ok).toBe(false);
    expect(canDropMove(["/a/b"], "/a").ok).toBe(false); // already in /a
    expect(canDropMove(["/a/b"], "/other").ok).toBe(true);
  });

  it("drop on file resolves to parent directory", () => {
    expect(dropMoveTargetDir("directory", "/home/u/docs")).toBe("/home/u/docs");
    expect(dropMoveTargetDir("file", "/home/u/docs/a.txt")).toBe(
      "/home/u/docs",
    );
    expect(
      canDropMove(["/tmp/x"], dropMoveTargetDir("file", "/home/u/a.txt")).ok,
    ).toBe(true);
    // Same folder sibling → already-there
    expect(
      canDropMove(
        ["/home/u/docs/a.txt"],
        dropMoveTargetDir("file", "/home/u/docs/b.txt"),
      ).ok,
    ).toBe(false);
  });

  it("parentRemotePath for reload targets", () => {
    expect(parentRemotePath("/home/u/docs/a.txt")).toBe("/home/u/docs");
    expect(parentRemotePath("/home/u")).toBe("/home");
    expect(parentRemotePath("/home")).toBe("/");
    expect(parentRemotePath("/")).toBe("/");
  });

  it("paste target prefers selected directory", () => {
    expect(pasteTargetDir("/home/u/docs", "directory", "/home/u")).toBe(
      "/home/u/docs",
    );
    expect(pasteTargetDir("/home/u/docs/a.txt", "file", "/home/u")).toBe(
      "/home/u/docs",
    );
    expect(pasteTargetDir(null, null, "/home/u")).toBe("/home/u");
  });

  it("range and toggle selection", () => {
    const ordered = ["a", "b", "c", "d"];
    expect(rangeSelectPaths(ordered, "a", "c", new Set())).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(togglePathInSelection(["a", "b"], "b")).toEqual(["a"]);
    expect(togglePathInSelection(["a"], "c")).toEqual(["a", "c"]);
  });
});

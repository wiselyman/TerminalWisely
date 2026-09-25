import { describe, expect, it } from "vitest";
import {
  canDropMove,
  collapseToDeleteRoots,
  dropMoveTargetDir,
  isProtectedDeletePath,
  isSameOrDescendantPath,
  parentRemotePath,
  pasteTargetDir,
  pathBreadcrumbSegments,
  pathsIntersectingMarquee,
  rangeSelectPaths,
  sanitizeDeleteSelection,
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

  it("paste fallback uses contents pane path when nothing selected", () => {
    expect(pasteTargetDir(null, null, "/media/firefly/Movies")).toBe(
      "/media/firefly/Movies",
    );
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

  it("sanitizeDeleteSelection drops browsing cwd when children are also selected", () => {
    expect(
      sanitizeDeleteSelection(
        ["/home/u", "/home/u/a.sh", "/home/u/b.sh"],
        "/home/u",
      ),
    ).toEqual(["/home/u/a.sh", "/home/u/b.sh"]);
    expect(sanitizeDeleteSelection(["/home/u"], "/home/u")).toEqual([
      "/home/u",
    ]);
    expect(
      sanitizeDeleteSelection(
        ["/home/u/docs", "/home/u/docs/a.txt"],
        "/home/u",
      ),
    ).toEqual(["/home/u/docs"]);
  });

  it("collapseToDeleteRoots keeps outermost parents", () => {
    expect(
      collapseToDeleteRoots(["/a/b", "/a/b/c", "/a/other"]),
    ).toEqual(["/a/b", "/a/other"]);
  });

  it("isProtectedDeletePath guards root and home", () => {
    expect(isProtectedDeletePath("/")).toBe(true);
    expect(isProtectedDeletePath("/home")).toBe(true);
    expect(isProtectedDeletePath("/home/u", "/home/u")).toBe(true);
    expect(isProtectedDeletePath("/home/u/a.txt", "/home/u")).toBe(false);
  });

  it("pathBreadcrumbSegments splits absolute paths", () => {
    expect(pathBreadcrumbSegments("/")).toEqual([{ label: "/", path: "/" }]);
    expect(pathBreadcrumbSegments("/home/u/docs")).toEqual([
      { label: "/", path: "/" },
      { label: "home", path: "/home" },
      { label: "u", path: "/home/u" },
      { label: "docs", path: "/home/u/docs" },
    ]);
  });

  it("pathsIntersectingMarquee hits overlapping items", () => {
    const items = [
      { path: "a", rect: { left: 0, top: 0, right: 10, bottom: 10 } },
      { path: "b", rect: { left: 20, top: 20, right: 30, bottom: 30 } },
    ];
    expect(
      pathsIntersectingMarquee(items, {
        left: 5,
        top: 5,
        right: 25,
        bottom: 25,
      }),
    ).toEqual(["a", "b"]);
    expect(
      pathsIntersectingMarquee(items, {
        left: 0,
        top: 0,
        right: 5,
        bottom: 5,
      }),
    ).toEqual(["a"]);
  });
});

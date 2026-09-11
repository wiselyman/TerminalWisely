/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  findTreeDropHit,
  isLocalFsTreeMoving,
  resolveTreeMoveDrop,
} from "./localFsPointerMove";

describe("localFsPointerMove", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.body.className = "";
  });

  it("resolveTreeMoveDrop: folder dest and file→parent", () => {
    expect(
      resolveTreeMoveDrop(["/a/x.txt"], {
        path: "/b",
        kind: "directory",
      }),
    ).toEqual({ destDir: "/b", highlightPath: "/b" });

    expect(
      resolveTreeMoveDrop(["/a/x.txt"], {
        path: "/b/readme.md",
        kind: "file",
      }),
    ).toEqual({ destDir: "/b", highlightPath: "/b/readme.md" });
  });

  it("resolveTreeMoveDrop rejects self / already-there / empty", () => {
    expect(
      resolveTreeMoveDrop(["/b/docs"], { path: "/b/docs", kind: "directory" }),
    ).toBeNull();
    expect(
      resolveTreeMoveDrop(["/b/docs"], {
        path: "/b/docs/nested",
        kind: "directory",
      }),
    ).toBeNull();
    expect(
      resolveTreeMoveDrop(["/b/a.txt"], {
        path: "/b/c.txt",
        kind: "file",
      }),
    ).toBeNull();
    expect(resolveTreeMoveDrop(["/a"], null)).toBeNull();
  });

  it("findTreeDropHit reads data-path/kind from row under point", () => {
    const row = document.createElement("div");
    row.className = "local-fs-tree-row";
    row.dataset.path = "/home/u/docs";
    row.dataset.kind = "directory";
    document.body.appendChild(row);

    document.elementFromPoint = () => row;
    expect(findTreeDropHit(10, 10)).toEqual({
      path: "/home/u/docs",
      kind: "directory",
    });
  });

  it("isLocalFsTreeMoving tracks body class", () => {
    expect(isLocalFsTreeMoving()).toBe(false);
    document.body.classList.add("local-fs-tree-moving");
    expect(isLocalFsTreeMoving()).toBe(true);
  });
});

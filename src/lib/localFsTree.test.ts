import { describe, expect, it } from "vitest";
import {
  buildVisibleTreeRows,
  directoryAncestorChain,
} from "./localFsTree";
import type { LocalFsEntry } from "../types";

const dir = (name: string, path: string): LocalFsEntry => ({
  name,
  path,
  kind: "directory",
});

const file = (name: string, path: string): LocalFsEntry => ({
  name,
  path,
  kind: "file",
  size_bytes: 10,
});

describe("buildVisibleTreeRows", () => {
  it("directoriesOnly hides files in the left tree", () => {
    const cache = {
      "/home/u": [
        dir("docs", "/home/u/docs"),
        file("a.txt", "/home/u/a.txt"),
      ],
      "/home/u/docs": [file("note.md", "/home/u/docs/note.md")],
    };
    const rows = buildVisibleTreeRows(
      "/home/u",
      cache,
      new Set(["/home/u", "/home/u/docs"]),
      new Set(),
      { directoriesOnly: true },
    );
    expect(rows.map((r) => r.entry.name)).toEqual(["docs"]);
  });

  it("includes files when directoriesOnly is off", () => {
    const cache = {
      "/home/u": [
        dir("docs", "/home/u/docs"),
        file("a.txt", "/home/u/a.txt"),
      ],
    };
    const rows = buildVisibleTreeRows(
      "/home/u",
      cache,
      new Set(["/home/u"]),
      new Set(),
    );
    expect(rows.map((r) => r.entry.name)).toEqual(["docs", "a.txt"]);
  });
});

describe("directoryAncestorChain", () => {
  it("returns root-to-path chain", () => {
    expect(
      directoryAncestorChain("/home/u", "/home/u/docs/deep"),
    ).toEqual(["/home/u", "/home/u/docs", "/home/u/docs/deep"]);
  });

  it("handles root itself", () => {
    expect(directoryAncestorChain("/home/u", "/home/u")).toEqual(["/home/u"]);
  });
});

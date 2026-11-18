import { describe, expect, it } from "vitest";
import type { LocalFsEntry } from "../types";
import { sortLocalFsEntries, type LocalFsSort } from "./localFsSort";

const entries: LocalFsEntry[] = [
  { name: "zeta.txt", path: "/zeta.txt", kind: "file", size_bytes: 5, modified_ms: 20 },
  { name: "folder", path: "/folder", kind: "directory" },
  { name: "alpha.txt", path: "/alpha.txt", kind: "file", size_bytes: 1, modified_ms: 10 },
  { name: "unknown.txt", path: "/unknown.txt", kind: "file" },
  { name: "tie.txt", path: "/tie.txt", kind: "file", size_bytes: 5, modified_ms: 20 },
];

describe("sortLocalFsEntries", () => {
  it.each([
    [{ field: "name", direction: "asc" }, ["folder", "alpha.txt", "tie.txt", "unknown.txt", "zeta.txt"]],
    [{ field: "name", direction: "desc" }, ["folder", "zeta.txt", "unknown.txt", "tie.txt", "alpha.txt"]],
    [{ field: "size", direction: "asc" }, ["folder", "alpha.txt", "zeta.txt", "tie.txt", "unknown.txt"]],
    [{ field: "size", direction: "desc" }, ["folder", "zeta.txt", "tie.txt", "alpha.txt", "unknown.txt"]],
    [{ field: "modified", direction: "asc" }, ["folder", "alpha.txt", "zeta.txt", "tie.txt", "unknown.txt"]],
    [{ field: "modified", direction: "desc" }, ["folder", "zeta.txt", "tie.txt", "alpha.txt", "unknown.txt"]],
  ] satisfies [LocalFsSort, string[]][]) ("sorts by %o", (sort, expected) => {
    expect(sortLocalFsEntries(entries, sort).map((entry) => entry.name)).toEqual(expected);
  });

  it("returns the original ordering when no sort is selected", () => {
    expect(sortLocalFsEntries(entries, null)).toEqual(entries);
  });
});

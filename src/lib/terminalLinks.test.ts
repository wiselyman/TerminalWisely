import { describe, expect, it } from "vitest";
import { findRemotePathMatches } from "./terminalLinks";

describe("findRemotePathMatches", () => {
  it("parses ls -la long format paths", () => {
    const line =
      "-rw-r--r-- 1 e2e e2e 12 Jan  1 00:00 app.log";
    const matches = findRemotePathMatches(line);
    expect(matches.some((m) => m.path === "app.log")).toBe(true);
  });

  it("finds tokens in ls -F output when inLsOutput is set", () => {
    const line = "app.log  bin/  README.md";
    const matches = findRemotePathMatches(line, { inLsOutput: true });
    expect(matches.map((m) => m.path)).toEqual(
      expect.arrayContaining(["app.log", "bin", "README.md"]),
    );
    expect(matches.find((m) => m.path === "bin")?.isDirectory).toBe(true);
  });

  it("returns empty for non-ls lines without inLsOutput", () => {
    const line = "e2e@host:~$ ls";
    const matches = findRemotePathMatches(line);
    expect(matches).toHaveLength(0);
  });
});

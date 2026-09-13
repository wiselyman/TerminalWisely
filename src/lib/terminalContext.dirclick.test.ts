import { describe, expect, it } from "vitest";
import {
  resolveDirectoryClickPath,
  resolvePathFromListing,
  isLineInLsOutput,
} from "./terminalContext";

function linesToGetter(lines: string[]) {
  return (n: number) => (n >= 1 && n <= lines.length ? lines[n - 1] : null);
}

describe("resolveDirectoryClickPath", () => {
  it("enters demo_data once from cd ~/Isaac-GR00T && ls -F", () => {
    const lines = [
      "wiselyman@host:~$ cd ~/Isaac-GR00T && ls -F",
      "AGENTS.md@  LICENSE  external_dependencies/  pyproject.toml",
      "ATTRIBUTIONS.md  README.md  getting_started/  scripts/",
      "CLAUDE.md  demo_data/  gr00t/  tests/",
      "wiselyman@host:~/Isaac-GR00T$",
    ];
    const get = linesToGetter(lines);
    expect(isLineInLsOutput(get, 4)).toBe(true);
    const fromListing = resolvePathFromListing(get, lines.length, 4, "demo_data");
    expect(fromListing).toBe("~/Isaac-GR00T/demo_data");
    expect(
      resolveDirectoryClickPath(fromListing, "~/Isaac-GR00T", "demo_data"),
    ).toBe("~/Isaac-GR00T/demo_data");
  });

  it("collapses accidental …/demo_data/demo_data when live cwd is the parent", () => {
    expect(
      resolveDirectoryClickPath(
        "~/Isaac-GR00T/demo_data/demo_data",
        "~/Isaac-GR00T",
        "demo_data",
      ),
    ).toBe("~/Isaac-GR00T/demo_data");
  });

  it("does not nest when already inside demo_data and parent listing is clicked", () => {
    expect(
      resolveDirectoryClickPath(
        "~/Isaac-GR00T/demo_data",
        "~/Isaac-GR00T/demo_data",
        "demo_data",
      ),
    ).toBe("~/Isaac-GR00T/demo_data");
  });

  it("allows a real nested demo_data entry inside demo_data", () => {
    expect(
      resolveDirectoryClickPath(
        "~/Isaac-GR00T/demo_data/demo_data",
        "~/Isaac-GR00T/demo_data",
        "demo_data",
      ),
    ).toBe("~/Isaac-GR00T/demo_data/demo_data");
  });
});

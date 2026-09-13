import { describe, expect, it } from "vitest";
import { isLineInLsOutput, resolvePathFromListing } from "./terminalContext";
import { findRemotePathMatches } from "./terminalLinks";

function linesToGetter(lines: string[]) {
  return (n: number) => (n >= 1 && n <= lines.length ? lines[n - 1] : null);
}

function wrapAt(s: string, cols: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += cols) out.push(s.slice(i, i + cols));
  return out;
}

describe("mp4 clickable after deep cd && ls -F", () => {
  const promptCmd =
    "wiselyman@gx10-387b:~/Isaac-GR00T/demo_data/droid_sample/videos/chunk-000$ cd ~/Isaac-GR00T/demo_data/droid_sample/videos/chunk-000/observation.images.exterior_1_left && ls -F";

  for (const cols of [60, 70, 80, 90, 100, 110, 120]) {
    it(`inLsOutput at cols=${cols}`, () => {
      const wrapped = wrapAt(promptCmd, cols);
      const lines = [
        ...wrapped,
        "episode_000000.mp4",
        "episode_000001.mp4",
        "episode_000002.mp4",
      ];
      const get = linesToGetter(lines);
      const fileLine = wrapped.length + 1;
      expect(isLineInLsOutput(get, fileLine)).toBe(true);
      expect(
        findRemotePathMatches(lines[fileLine - 1], { inLsOutput: true }).map(
          (m) => m.path,
        ),
      ).toContain("episode_000000.mp4");
      const resolved = resolvePathFromListing(
        get,
        lines.length,
        fileLine,
        "episode_000000.mp4",
      );
      expect(resolved).toContain(
        "observation.images.exterior_1_left/episode_000000.mp4",
      );
    });
  }
});

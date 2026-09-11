import { describe, expect, it } from "vitest";
import {
  assemblePromptRegion,
  parsePromptCwd,
  resolvePathFromListing,
  isLineInLsOutput,
} from "./terminalContext";

function linesToGetter(lines: string[]) {
  return (n: number) => (n >= 1 && n <= lines.length ? lines[n - 1] : null);
}

describe("assemblePromptRegion + deep cwd download path", () => {
  it("joins soft-wrapped SSH prompts so full cwd is recovered", () => {
    const lines = [
      "wiselyman@gx10-387b:~/Isaac-GR00T/demo_data/droid_sample/videos/chunk-000/observation.images.exter",
      "ior_1_left$ ls -F",
      "episode_000000.mp4",
      "episode_000001.mp4",
    ];
    const get = linesToGetter(lines);
    const { plain, endLine } = assemblePromptRegion(get, 1, 5);
    expect(endLine).toBe(2);
    expect(parsePromptCwd(plain)).toBe(
      "~/Isaac-GR00T/demo_data/droid_sample/videos/chunk-000/observation.images.exterior_1_left",
    );
  });

  it("resolves ls basename against wrapped prompt cwd (not home)", () => {
    const lines = [
      "wiselyman@gx10-387b:~/Isaac-GR00T$",
      "cd demo_data/droid_sample/videos/chunk-000/observation.images.exterior_1_left",
      "wiselyman@gx10-387b:~/Isaac-GR00T/demo_data/droid_sample/videos/chunk-000/observation.images.exter",
      "ior_1_left$ ls -F",
      "episode_000000.mp4",
      "episode_000001.mp4",
    ];
    const get = linesToGetter(lines);
    expect(isLineInLsOutput(get, 5)).toBe(true);
    const resolved = resolvePathFromListing(get, lines.length, 5, "episode_000000.mp4");
    expect(resolved).toBe(
      "~/Isaac-GR00T/demo_data/droid_sample/videos/chunk-000/observation.images.exterior_1_left/episode_000000.mp4",
    );
  });

  it("does not fall back to an older short prompt when wrap is present", () => {
    const lines = [
      "wiselyman@host:~/Isaac-GR00T$",
      "wiselyman@host:~/Isaac-GR00T/demo_data/droid_sample/videos/chunk-000/observation.images.exter",
      "ior_1_left$ ls -F",
      "episode_000000.mp4",
    ];
    const get = linesToGetter(lines);
    const resolved = resolvePathFromListing(get, lines.length, 4, "episode_000000.mp4");
    expect(resolved).toContain("observation.images.exterior_1_left");
    expect(resolved).not.toBe("~/Isaac-GR00T/episode_000000.mp4");
  });
});

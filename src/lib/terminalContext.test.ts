import { describe, expect, it } from "vitest";
import {
  assemblePromptRegion,
  joinCommandWrap,
  parsePromptCwd,
  refineListingPath,
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

  it("refineListingPath keeps ~/file from home listing when cwd has moved", () => {
    expect(
      refineListingPath(
        "~/AI-Agents-in-Depth-zh-CN.pdf",
        "~/Isaac-GR00T",
      ),
    ).toBe("~/AI-Agents-in-Depth-zh-CN.pdf");
  });

  it("refineListingPath joins bare basenames with live cwd", () => {
    expect(
      refineListingPath(
        "episode_000000.mp4",
        "~/Isaac-GR00T/demo_data/droid_sample/videos/chunk-000/observation.images.exterior_1_left",
      ),
    ).toBe(
      "~/Isaac-GR00T/demo_data/droid_sample/videos/chunk-000/observation.images.exterior_1_left/episode_000000.mp4",
    );
  });

  it("keeps listing parent for directory names (does not treat videos/ as a file under cwd)", () => {
    const lines = [
      "wiselyman@host:~/Isaac-GR00T/demo_data/droid_sample$ ls -F",
      "videos/",
      "annotations/",
    ];
    const get = linesToGetter(lines);
    expect(isLineInLsOutput(get, 2)).toBe(true);
    const resolved = resolvePathFromListing(get, lines.length, 2, "videos");
    expect(resolved).toBe("~/Isaac-GR00T/demo_data/droid_sample/videos");
    // refine must not re-root under a deeper live cwd when opening a sibling/parent dir name
    const liveDeep =
      "~/Isaac-GR00T/demo_data/droid_sample/videos/chunk-000/observation.images.exterior_1_left";
    expect(refineListingPath(resolved, liveDeep)).toBe(resolved);
  });

  it("joinCommandWrap does not insert space into soft-wrapped path segments", () => {
    expect(
      joinCommandWrap(
        "cd ~/Isaac-GR00T/demo_data/droi",
        "d_sample/videos && ls -F",
      ),
    ).toBe("cd ~/Isaac-GR00T/demo_data/droid_sample/videos && ls -F");
    expect(joinCommandWrap("cd ~/foo", "&& ls -F")).toBe("cd ~/foo && ls -F");
    expect(joinCommandWrap("cd ~/foo", "ls -F")).toBe("cd ~/foo ls -F");
  });
});

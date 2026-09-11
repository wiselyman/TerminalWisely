import { describe, expect, it } from "vitest";
import { formatSizeHuman } from "./formatSize";

describe("formatSizeHuman", () => {
  it("formats kilobytes", () => {
    expect(formatSizeHuman(512)).toBe("0.5 K");
  });

  it("formats megabytes", () => {
    expect(formatSizeHuman(2 * 1024 * 1024)).toBe("2.0 M");
  });

  it("formats gigabytes", () => {
    expect(formatSizeHuman(3 * 1024 * 1024 * 1024)).toBe("3.0 G");
  });
});

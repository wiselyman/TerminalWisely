import { describe, expect, it } from "vitest";
import { clampHomeSplitRatio, parseHomeSplitRatio } from "./homeSplit";

describe("Home split ratio", () => {
  it("uses an even split when there is no saved value", () => {
    expect(parseHomeSplitRatio(null)).toBe(0.5);
  });

  it("clamps stored and interactive values to the usable range", () => {
    expect(parseHomeSplitRatio("0.1")).toBe(0.2);
    expect(parseHomeSplitRatio("0.9")).toBe(0.8);
    expect(clampHomeSplitRatio(0.35)).toBe(0.35);
  });

  it("falls back to an even split for invalid values", () => {
    expect(parseHomeSplitRatio("not-a-ratio")).toBe(0.5);
    expect(clampHomeSplitRatio(Number.NaN)).toBe(0.5);
  });
});

import { describe, expect, it } from "vitest";
import { iconFillForTheme } from "./osLogos";

describe("iconFillForTheme", () => {
  it("lifts near-black logos on dark chrome", () => {
    expect(iconFillForTheme("000000", "dark")).toBe("#e6edf3");
    expect(iconFillForTheme("#111111", "dark")).toBe("#e6edf3");
  });

  it("keeps saturated brand colors on dark chrome", () => {
    expect(iconFillForTheme("E95420", "dark")).toBe("#e95420");
  });

  it("darkens near-white logos on light chrome", () => {
    expect(iconFillForTheme("ffffff", "light")).toBe("#1f2328");
    expect(iconFillForTheme("#f5f5f5", "light")).toBe("#1f2328");
  });

  it("keeps brand colors on light chrome", () => {
    expect(iconFillForTheme("E95420", "light")).toBe("#e95420");
  });
});

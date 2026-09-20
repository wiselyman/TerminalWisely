import { describe, expect, it } from "vitest";
import {
  BROWSER_FIT_WIDTH_EVAL,
  BROWSER_PAGE_META_EVAL,
  computeFitWidthZoom,
  fallbackFaviconUrl,
} from "./browserPageChrome";

describe("fallbackFaviconUrl", () => {
  it("maps http(s) pages to origin/favicon.ico", () => {
    expect(fallbackFaviconUrl("https://www.baidu.com/s?wd=1")).toBe(
      "https://www.baidu.com/favicon.ico",
    );
    expect(fallbackFaviconUrl("http://127.0.0.1:8000/app")).toBe(
      "http://127.0.0.1:8000/favicon.ico",
    );
  });

  it("returns null for non-http URLs", () => {
    expect(fallbackFaviconUrl("about:blank")).toBeNull();
    expect(fallbackFaviconUrl("not a url")).toBeNull();
  });
});

describe("computeFitWidthZoom", () => {
  it("returns 1 when content fits the viewport", () => {
    expect(computeFitWidthZoom(800, 900)).toBe(1);
    expect(computeFitWidthZoom(500, 500)).toBe(1);
  });

  it("scales down when scrollWidth overflows (Baidu-in-narrow-panel)", () => {
    expect(computeFitWidthZoom(900, 600)).toBeCloseTo(2 / 3, 5);
    // floor at minZoom 0.55 by default
    expect(computeFitWidthZoom(2000, 500)).toBeCloseTo(0.55, 5);
  });

  it("ignores tiny overflow within slack", () => {
    expect(computeFitWidthZoom(508, 500)).toBe(1);
  });
});

describe("BROWSER_FIT_WIDTH_EVAL", () => {
  it("is a self-invoking script that sets documentElement zoom", () => {
    expect(BROWSER_FIT_WIDTH_EVAL.startsWith("(function(){")).toBe(true);
    expect(BROWSER_FIT_WIDTH_EVAL).toContain("style.zoom");
    expect(BROWSER_FIT_WIDTH_EVAL).toContain("scrollWidth");
  });
});

describe("BROWSER_PAGE_META_EVAL", () => {
  it("reads document title and favicon link href", () => {
    expect(BROWSER_PAGE_META_EVAL).toContain("document.title");
    expect(BROWSER_PAGE_META_EVAL).toContain("favicon.ico");
    expect(BROWSER_PAGE_META_EVAL).toContain("rel~=\"icon\"");
  });
});

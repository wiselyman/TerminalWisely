import { describe, expect, it } from "vitest";
import {
  browserDesktopIsFront,
  centerDesktopFrame,
  moveDesktopFrame,
  resizeDesktopFrame,
} from "./desktopWindowFrame";

const bounds = { width: 1200, height: 800 };

describe("desktopWindowFrame", () => {
  it("centers a default window inside the surface", () => {
    const frame = centerDesktopFrame(bounds);
    expect(frame.width).toBeLessThanOrEqual(bounds.width);
    expect(frame.height).toBeLessThanOrEqual(bounds.height);
    expect(frame.x).toBeGreaterThan(0);
    expect(frame.y).toBeGreaterThan(0);
  });

  it("moves and resizes without leaving the surface", () => {
    const start = centerDesktopFrame(bounds);
    const moved = moveDesktopFrame(start, 20, 10, bounds);
    expect(moved.x).toBe(start.x + 20);
    expect(moved.y).toBe(start.y + 10);
    expect(moved.width).toBe(start.width);

    const grown = resizeDesktopFrame(moved, "se", 50, 30, bounds);
    expect(grown.width).toBe(moved.width + 50);
    expect(grown.height).toBe(moved.height + 30);
    expect(grown.x + grown.width).toBeLessThanOrEqual(bounds.width);
    expect(grown.y + grown.height).toBeLessThanOrEqual(bounds.height);
  });

  it("treats the browser as front only when it is the top open window", () => {
    const open = { open: true, minimized: false };
    const hidden = { open: true, minimized: true };
    expect(
      browserDesktopIsFront(["files", "browser"], {
        files: open,
        browser: open,
      }),
    ).toBe(true);
    expect(
      browserDesktopIsFront(["browser", "terminal"], {
        browser: open,
        terminal: open,
      }),
    ).toBe(false);
    expect(
      browserDesktopIsFront(["browser"], { browser: hidden }),
    ).toBe(false);
  });
});

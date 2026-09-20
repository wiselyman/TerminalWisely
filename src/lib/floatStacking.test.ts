import { describe, expect, it } from "vitest";
import {
  DESKTOP_APP_FLOAT_Z_BASE,
  desktopAppFloatZ,
  PREVIEW_DOCK_Z,
  PREVIEW_FLOAT_Z,
  previewCoversDesktopApps,
} from "./floatStacking";

describe("floatStacking", () => {
  it("keeps preview above dock-app floats", () => {
    expect(previewCoversDesktopApps()).toBe(true);
    expect(PREVIEW_FLOAT_Z).toBeGreaterThan(DESKTOP_APP_FLOAT_Z_BASE);
    expect(PREVIEW_DOCK_Z).toBeGreaterThan(PREVIEW_FLOAT_Z);
    expect(desktopAppFloatZ(3)).toBeLessThan(PREVIEW_FLOAT_Z);
  });
});

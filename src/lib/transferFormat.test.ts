import { describe, expect, it } from "vitest";
import {
  formatMegabytes,
  formatSpeedMbps,
  formatTransferPercent,
} from "./transferFormat";

describe("transferFormat", () => {
  it("formats megabytes", () => {
    expect(formatMegabytes(0)).toBe("0.00 MB");
    expect(formatMegabytes(1024 * 1024)).toBe("1.00 MB");
  });

  it("formats speed", () => {
    expect(formatSpeedMbps(0)).toBe("");
    expect(formatSpeedMbps(1024 * 1024)).toBe("1.00 MB/s");
  });

  it("computes transfer percent capped at 100", () => {
    expect(formatTransferPercent(50, 100)).toBe(50);
    expect(formatTransferPercent(150, 100)).toBe(100);
    expect(formatTransferPercent(1, 0)).toBeNull();
  });
});

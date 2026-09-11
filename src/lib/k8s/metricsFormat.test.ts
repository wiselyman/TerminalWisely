import { describe, expect, it } from "vitest";
import {
  formatUsagePercent,
  parseCpuToMilli,
  parseMemoryToKi,
  usageRatio,
} from "./metricsFormat";

describe("k8s metricsFormat", () => {
  it("parses CPU millicores and cores", () => {
    expect(parseCpuToMilli("576m")).toBe(576);
    expect(parseCpuToMilli("8.00")).toBe(8000);
    expect(parseCpuToMilli("2")).toBe(2000);
  });

  it("parses memory units", () => {
    expect(parseMemoryToKi("2500Mi")).toBe(2500 * 1024);
    expect(parseMemoryToKi("2.5Gi")).toBe(2.5 * 1024 * 1024);
    expect(parseMemoryToKi("31.0Gi")).toBe(31 * 1024 * 1024);
  });

  it("computes usage ratio", () => {
    expect(usageRatio(576, 8000)).toBeCloseTo(0.072);
    expect(formatUsagePercent(0.072)).toBe("7%");
    expect(usageRatio(8, 110)).toBeCloseTo(8 / 110);
  });
});

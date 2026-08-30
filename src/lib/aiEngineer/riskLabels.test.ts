import { describe, expect, it } from "vitest";
import {
  normalizeRiskCode,
  riskDescKey,
  riskLabelKey,
  RISK_CODES,
} from "./riskLabels";

describe("riskLabels", () => {
  it("normalizes valid risk codes", () => {
    expect(normalizeRiskCode("r3")).toBe("R3");
    expect(normalizeRiskCode(" R4 ")).toBe("R4");
  });

  it("defaults unknown codes to R2", () => {
    expect(normalizeRiskCode("R9")).toBe("R2");
    expect(normalizeRiskCode("")).toBe("R2");
  });

  it("exports all risk codes", () => {
    expect(RISK_CODES).toEqual(["R0", "R1", "R2", "R3", "R4"]);
  });

  it("builds i18n keys", () => {
    expect(riskLabelKey("r1")).toBe("aiEngineer.risk.R1.label");
    expect(riskDescKey("bad")).toBe("aiEngineer.risk.R2.desc");
  });
});

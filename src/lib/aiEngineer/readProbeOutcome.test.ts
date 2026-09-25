import { describe, expect, it } from "vitest";
import { interpretReadProbeOutcome } from "./readProbeOutcome";

describe("interpretReadProbeOutcome", () => {
  it("treats exit 0 as ok", () => {
    expect(
      interpretReadProbeOutcome({ exitCode: 0, stdout: "x", stderr: "" }),
    ).toEqual({ kind: "ok" });
  });

  it("marks filter-no-match when exit 1, empty stderr, non-empty stdout", () => {
    const out = interpretReadProbeOutcome({
      exitCode: 1,
      stdout: "==============NVSMI LOG==============\nGraphics : 2790 MHz\n",
      stderr: "",
    });
    expect(out.kind).toBe("filter_no_match");
    if (out.kind === "filter_no_match") {
      expect(out.note.toLowerCase()).toContain("filter");
    }
  });

  it("keeps hard fail when grep alone matched nothing (empty stdout)", () => {
    expect(
      interpretReadProbeOutcome({ exitCode: 1, stdout: "", stderr: "" }),
    ).toEqual({ kind: "failed", error: "exit_code 1" });
  });

  it("keeps hard fail when stderr has content", () => {
    expect(
      interpretReadProbeOutcome({
        exitCode: 1,
        stdout: "partial",
        stderr: "permission denied",
      }),
    ).toEqual({ kind: "failed", error: "exit_code 1" });
  });

  it("keeps hard fail for exit codes other than 1", () => {
    expect(
      interpretReadProbeOutcome({
        exitCode: 127,
        stdout: "hello",
        stderr: "",
      }),
    ).toEqual({ kind: "failed", error: "exit_code 127" });
  });

  it("timed out always fails", () => {
    expect(
      interpretReadProbeOutcome({
        exitCode: 0,
        stdout: "x",
        stderr: "",
        timedOut: true,
      }).kind,
    ).toBe("failed");
  });
});

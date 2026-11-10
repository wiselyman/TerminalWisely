import { describe, expect, it } from "vitest";
import { evaluateBenchmark, median } from "../../scripts/markdown-benchmark/analyze.mjs";
import { createPairedReport } from "../../scripts/markdown-benchmark/capture.mjs";
import { generateLargeFixture } from "../../scripts/markdown-benchmark/fixtures/generate.mjs";
import { createHash } from "node:crypto";

describe("Markdown benchmark report", () => {
  it("aggregates odd and even sample sets", () => {
    expect(median([9, 1, 5])).toBe(5);
    expect(median([8, 2, 4, 6])).toBe(5);
  });

  it("requires comparison metadata and paired repeated samples", () => {
    const result = evaluateBenchmark({ metadata: {}, terminalWisely: {}, typora: {} });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects zero placeholders so an unmeasured report cannot pass", () => {
    const report = {
      metadata: {
        os: "linux", device: "CI", appVersion: "0.1.1", typoraVersion: "1.x",
        fixtureHash: "sha256:abc", coldWarmCondition: "warm",
      },
      terminalWisely: { startup: [0, 0, 0], open: [0, 0, 0], input: [0, 0, 0], scroll: [0, 0, 0], save: [0, 0, 0] },
      typora: { startup: [0, 0, 0], open: [0, 0, 0], input: [0, 0, 0], scroll: [0, 0, 0], save: [0, 0, 0] },
    };
    expect(evaluateBenchmark(report).valid).toBe(false);
  });

  it("allows exactly 10 percent on macOS and blocks any metric above the gate", () => {
    const report = {
      metadata: {
        os: "macos", device: "Reference Mac", appVersion: "0.1.1", typoraVersion: "1.x",
        fixtureHash: "sha256:abc", coldWarmCondition: "warm",
      },
      terminalWisely: { startup: [110, 100, 120], open: [110, 100, 120], input: [110, 100, 120], scroll: [110, 100, 120], save: [110, 100, 120] },
      typora: { startup: [100, 100, 100], open: [100, 100, 100], input: [100, 100, 100], scroll: [100, 100, 100], save: [100, 100, 100] },
    };
    expect(evaluateBenchmark(report).passed).toBe(true);
    report.terminalWisely.input = [111, 100, 120];
    const failed = evaluateBenchmark(report);
    expect(failed.passed).toBe(false);
    expect(failed.regressions).toContain("input");
  });

  it("builds paired reports from exact fixture bytes and rejects unpaired samples", () => {
    const fixture = "# Fixed fixture\r\n\r\nA stable document.\r\n";
    const base = {
      metadata: { os: "macos", device: "Mac15,12 / Apple M3", appVersion: "0.1.1", typoraVersion: "1.11", coldWarmCondition: "warm" },
      terminalWisely: { startup: [40, 42, 41], open: [12, 13, 11], input: [4, 3, 5], scroll: [8, 7, 9], save: [6, 7, 5] },
      typora: { startup: [39, 40, 41], open: [10, 11, 9], input: [3, 4, 3], scroll: [7, 8, 7], save: [5, 6, 5] },
    };
    const report = createPairedReport({ ...base, fixture });
    expect(report.metadata.fixtureHash).toBe(createHash("sha256").update(fixture).digest("hex"));
    expect(report.terminalWisely).toEqual(base.terminalWisely);
    expect(evaluateBenchmark(report).valid).toBe(true);

    expect(() => createPairedReport({
      ...base,
      fixture,
      typora: { ...base.typora, input: [3, 4] },
    })).toThrow(/paired sample counts/i);
  });

  it("generates deterministic fixtures with stable mixed Markdown constructs", () => {
    const first = generateLargeFixture(32);
    expect(generateLargeFixture(32)).toBe(first);
    expect(first).toContain("```unknown-extension");
    expect(first).toContain("```mermaid");
    expect(first).toContain("$$");
    expect(first).toContain("<details>");
    expect(() => generateLargeFixture(0)).toThrow(/sectionCount/);
  });
});

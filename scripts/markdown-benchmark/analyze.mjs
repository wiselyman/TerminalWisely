import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const BENCHMARK_METRICS = ["startup", "open", "input", "scroll", "save"];
const REQUIRED_METADATA = ["os", "device", "appVersion", "typoraVersion", "fixtureHash", "coldWarmCondition"];

export function median(values) {
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new TypeError("Samples must be a non-empty list of finite, positive numbers.");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function evaluateBenchmark(report) {
  const errors = [];
  const metadata = report?.metadata;
  for (const field of REQUIRED_METADATA) {
    if (typeof metadata?.[field] !== "string" || !metadata[field].trim()) errors.push(`metadata.${field} is required`);
  }
  const medians = { terminalWisely: {}, typora: {} };
  for (const application of ["terminalWisely", "typora"]) {
    for (const metric of BENCHMARK_METRICS) {
      const samples = report?.[application]?.[metric];
      if (!Array.isArray(samples) || samples.length < 3 || samples.some((value) => !Number.isFinite(value) || value <= 0)) {
        errors.push(`${application}.${metric} requires at least three finite, positive samples`);
        continue;
      }
      medians[application][metric] = median(samples);
    }
  }
  const regressions = [];
  const isMacOS = /^mac(?:os)?$/i.test(metadata?.os ?? "");
  if (errors.length === 0 && isMacOS) {
    for (const metric of BENCHMARK_METRICS) {
      if (medians.typora[metric] === 0) {
        errors.push(`typora.${metric} median must be greater than zero`);
      } else if (medians.terminalWisely[metric] > medians.typora[metric] * 1.1) {
        regressions.push(metric);
      }
    }
  }
  const valid = errors.length === 0;
  return { valid, passed: valid && regressions.length === 0, medians, regressions, errors, macOSGate: isMacOS };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const reportPath = process.argv[2];
  if (!reportPath) {
    console.error("Usage: node scripts/markdown-benchmark/analyze.mjs <paired-report.json>");
    process.exitCode = 2;
  } else {
    try {
      const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      const result = evaluateBenchmark(report);
      console.log(JSON.stringify(result, null, 2));
      if (!result.valid) process.exitCode = 2;
      else if (!result.passed) process.exitCode = 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 2;
    }
  }
}

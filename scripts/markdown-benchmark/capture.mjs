import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { BENCHMARK_METRICS } from "./analyze.mjs";

const REQUIRED_METADATA = ["os", "device", "appVersion", "typoraVersion", "coldWarmCondition"];

export function createPairedReport(capture) {
  const fixtureBytes = Buffer.isBuffer(capture?.fixture)
    ? capture.fixture
    : typeof capture?.fixture === "string" ? Buffer.from(capture.fixture, "utf8") : null;
  if (!fixtureBytes?.byteLength) throw new TypeError("A non-empty exact fixture is required.");
  for (const field of REQUIRED_METADATA) {
    if (typeof capture?.metadata?.[field] !== "string" || !capture.metadata[field].trim()) {
      throw new TypeError(`metadata.${field} is required.`);
    }
  }

  const terminalWisely = {};
  const typora = {};
  for (const metric of BENCHMARK_METRICS) {
    const twSamples = capture?.terminalWisely?.[metric];
    const typoraSamples = capture?.typora?.[metric];
    if (!validValues(twSamples) || !validValues(typoraSamples)) {
      throw new TypeError(`${metric} requires finite, positive samples for both applications.`);
    }
    if (twSamples.length !== typoraSamples.length) {
      throw new TypeError(`${metric} paired sample counts must match.`);
    }
    if (twSamples.length < 3) {
      throw new TypeError(`${metric} requires at least three paired samples.`);
    }
    terminalWisely[metric] = [...twSamples];
    typora[metric] = [...typoraSamples];
  }

  return {
    metadata: {
      ...capture.metadata,
      fixtureHash: createHash("sha256").update(fixtureBytes).digest("hex"),
    },
    terminalWisely,
    typora,
  };
}

function validValues(samples) {
  return Array.isArray(samples) &&
    samples.every((sample) => Number.isFinite(sample) && sample > 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [capturePath, outputPath] = process.argv.slice(2);
  if (!capturePath || !outputPath) {
    console.error("Usage: node scripts/markdown-benchmark/capture.mjs <raw-capture.json> <paired-report.json>");
    process.exitCode = 2;
  } else {
    try {
      const absoluteCapture = path.resolve(capturePath);
      const raw = JSON.parse(fs.readFileSync(absoluteCapture, "utf8"));
      const fixturePath = path.resolve(path.dirname(absoluteCapture), raw.fixtureFile ?? "");
      const report = createPairedReport({ ...raw, fixture: fs.readFileSync(fixturePath) });
      fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
      console.log(`Wrote paired benchmark report: ${path.resolve(outputPath)}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 2;
    }
  }
}

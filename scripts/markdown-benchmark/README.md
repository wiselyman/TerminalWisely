# MarkWisely / Typora comparison

`capture.mjs` turns raw paired timings into a release report. It hashes the exact fixture bytes, requires matching sample counts for each app/metric, and writes the schema consumed by `analyze.mjs`. Both apps must use the same device, fixture, cold/warm condition, and number of runs. Record at least three millisecond samples for `startup`, `open`, `input`, `scroll`, and `save`; the analyzer compares medians and fails macOS when any TerminalWisely median is more than 10% slower.

## Fixed fixtures and run conditions

The fixed corpus is in `fixtures/`: `small-markdown.md` and `large-markdown.md` cover front matter, prose, nested lists, tables, code, math, diagrams, raw HTML, and an unknown fenced language. Regenerate the exact large fixture bytes with `node scripts/markdown-benchmark/fixtures/generate.mjs`; an optional second argument sets the section count. Keep the fixture and cold/warm condition identical for both apps. Alternate which application runs first between paired trials and record at least three runs for each condition.

## Raw capture format

Raw capture JSON includes the fixture path, environment details, and paired samples:

```json
{
  "fixtureFile": "/absolute/path/to/scripts/markdown-benchmark/fixtures/large-markdown.md",
  "metadata": {
    "os": "macos",
    "device": "Mac model and chip",
    "appVersion": "TerminalWisely version",
    "typoraVersion": "Typora version",
    "coldWarmCondition": "warm"
  },
  "terminalWisely": {
    "startup": [120, 118, 119],
    "open": [40, 39, 41],
    "input": [8, 7, 8],
    "scroll": [12, 11, 13],
    "save": [20, 19, 21]
  },
  "typora": {
    "startup": [110, 112, 109],
    "open": [38, 37, 39],
    "input": [7, 7, 6],
    "scroll": [10, 11, 10],
    "save": [18, 19, 17]
  }
}
```

`fixtureFile` may be absolute or relative to the raw JSON file. Replace example timings with measured samples. Capture computes the fixture hash and rejects unmatched or incomplete pairs:

```sh
node scripts/markdown-benchmark/capture.mjs /absolute/path/to/raw-capture.json /absolute/path/to/paired-report.json
node scripts/markdown-benchmark/analyze.mjs /absolute/path/to/paired-report.json
```

The capture tool validates and packages paired timings; timings still need to be measured on the reference device and attached with the raw records to the release record.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function generateLargeFixture(sectionCount = 256) {
  if (!Number.isInteger(sectionCount) || sectionCount < 1 || sectionCount > 5000) {
    throw new TypeError("sectionCount must be an integer between 1 and 5000.");
  }
  const parts = [
    "---\ntitle: MarkWisely benchmark corpus\ntags: [markdown, benchmark, offline]\n---",
    "# MarkWisely benchmark corpus",
    "A deterministic mixed-content Markdown document for paired editor measurements.",
    "## Contents",
    Array.from({ length: 16 }, (_, index) => `- [Section ${index + 1}](#section-${index + 1})`).join("\n"),
  ];
  for (let index = 1; index <= sectionCount; index += 1) {
    parts.push(
      `## Section ${index}`,
      `This section contains stable prose for measuring editing, layout, and scrolling. Section **${index}** includes *emphasis*, ~~removed text~~, and \`inline code\`.`,
      `> A quoted note for section ${index}, with consistent text length across runs.`,
      `- First item for ${index}\n- Second item with [a reference](https://example.invalid/${index})\n  - Nested item`,
    );
    if (index % 8 === 0) {
      parts.push(
        `| Item ${index} | State | Count |\n| --- | :---: | ---: |\n| Alpha | Ready | ${index} |\n| Beta | Pending | ${index + 1} |`,
        `\`\`\`typescript\nexport function measure${index}(value: number): number {\n  return Math.round(value * 1.125);\n}\n\`\`\``,
      );
    }
    if (index % 32 === 0) {
      parts.push(
        `$$\nf(x) = \\int_0^x t^${index % 7 + 1} \\, dt\n$$`,
        `\`\`\`mermaid\nflowchart LR\n  A${index}[Open] --> B${index}[Edit] --> C${index}[Save]\n\`\`\``,
      );
    }
  }
  parts.push("## Compatibility fixtures", "<details><summary>Raw HTML is kept verbatim</summary>\n\nThis block exercises source preservation.\n\n</details>", "```unknown-extension\nraw extension payload\n```");
  return `${parts.join("\n\n")}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const output = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "large-markdown.md"));
  const sectionCount = Number(process.argv[3] ?? 256);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, generateLargeFixture(sectionCount), "utf8");
  console.log(`Wrote deterministic benchmark fixture: ${output}`);
}

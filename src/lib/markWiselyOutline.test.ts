import { describe, expect, it } from "vitest";
import { extractMarkdownHeadings, filterMarkdownHeadings } from "./markWiselyOutline";

describe("MarkWisely outline", () => {
  it("extracts visible headings while ignoring front matter and fenced code", () => {
    const headings = extractMarkdownHeadings([
      "---", "title: # not a heading", "---", "",
      "# First **heading**", "", "```md", "## example", "```", "",
      "### [Linked](https://example.test) heading", "",
    ].join("\n"));
    expect(headings).toEqual([
      { index: 0, level: 1, text: "First heading" },
      { index: 1, level: 3, text: "Linked heading" },
    ]);
  });

  it("filters heading labels case-insensitively without changing their source indexes", () => {
    const headings = extractMarkdownHeadings("# Alpha\n## Beta Heading\n### Gamma");
    expect(filterMarkdownHeadings(headings, "BETA")).toEqual([
      { index: 1, level: 2, text: "Beta Heading" },
    ]);
  });
});

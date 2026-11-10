import { describe, expect, it } from "vitest";
import { countMarkdown } from "./markdownStatistics";

describe("countMarkdown", () => {
  it("counts mixed Chinese and English text, characters, lines, and reading time", () => {
    expect(countMarkdown("你好世界 hello world\nsecond line")).toEqual({
      words: 8,
      characters: 24,
      lines: 2,
      readingMinutes: 1,
    });
  });

  it("counts selected text and keeps code content in document statistics", () => {
    expect(countMarkdown("Intro\n```rust\nlet value = 1;\n```", { start: 14, end: 29 }).words).toBe(3);
    expect(countMarkdown("```rust\nlet value = 1;\n```").words).toBe(3);
  });
});

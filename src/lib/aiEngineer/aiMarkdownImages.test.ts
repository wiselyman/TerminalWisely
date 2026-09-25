import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decorateImages,
  selectStreamingMarkdownHtml,
} from "../../components/aiEngineer/AiMarkdown";

describe("decorateImages", () => {
  it("adds class and testid to bare img tags", () => {
    const out = decorateImages('<p><img src="https://example.com/a.png" alt="x"></p>');
    expect(out).toContain('class="ai-engineer-md-img"');
    expect(out).toContain('data-testid="ai-md-image"');
    expect(out).toContain('src="https://example.com/a.png"');
  });

  it("does not duplicate class when already present", () => {
    const out = decorateImages(
      '<img class="ai-engineer-md-img" src="https://example.com/a.png">',
    );
    expect(out.match(/ai-engineer-md-img/g)?.length).toBe(1);
  });
});

describe("selectStreamingMarkdownHtml", () => {
  it("uses sync html when no async rewrite exists", () => {
    expect(selectStreamingMarkdownHtml("<p>new</p>", null)).toBe("<p>new</p>");
  });

  it("ignores a previous token's async html so stream pin measures this commit", () => {
    expect(
      selectStreamingMarkdownHtml("<p>token two is longer</p>", {
        source: "<p>token one</p>",
        html: "<p>token one cached</p>",
      }),
    ).toBe("<p>token two is longer</p>");
  });

  it("keeps async html only when it was rewritten from this exact source", () => {
    const source = '<p><img src="https://example.com/a.png"></p>';
    const rewritten = '<p><img src="data:image/svg+xml,cached"></p>';
    expect(
      selectStreamingMarkdownHtml(source, { source, html: rewritten }),
    ).toBe(rewritten);
  });
});

describe("ai chat markdown image css", () => {
  it("centers and scales all .ai-engineer-md img with chat container", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/App.css"),
      "utf8",
    );
    expect(css).toMatch(/\.ai-engineer-chat\s*\{[^}]*container-type:\s*inline-size/);
    expect(css).toMatch(/\.ai-engineer-md img\s*,/);
    expect(css).toMatch(/max-width:\s*min\(100%,\s*82%\)/);
    expect(css).toMatch(/max-width:\s*min\(100%,\s*82cqi\)/);
    expect(css).toMatch(/max-height:\s*min\(38cqi,\s*220px\)/);
    expect(css).toMatch(/margin:\s*0\.65em auto/);
    expect(css).toMatch(/object-fit:\s*contain/);
  });
});

import { describe, expect, it } from "vitest";
import {
  formatWebToolPreview,
  isWebToolName,
  webToolKeywordLine,
} from "./webToolCard";

describe("webToolCard", () => {
  it("detects web tools", () => {
    expect(isWebToolName("web_search")).toBe(true);
    expect(isWebToolName("web_fetch")).toBe(true);
    expect(isWebToolName("terminal_exec")).toBe(false);
  });

  it("shows query/url keywords without dump prefixes", () => {
    expect(
      webToolKeywordLine("web_search", "AMD Threadripper PRO price"),
    ).toBe("AMD Threadripper PRO price");
    expect(
      webToolKeywordLine("web_fetch", "url: https://example.com/gpu\ngoal: x"),
    ).toBe("https://example.com/gpu");
  });

  it("previews fetch text and search hits", () => {
    expect(
      formatWebToolPreview(
        JSON.stringify({ text: "Hello page ".repeat(80), _untrusted: true }),
      ),
    ).toMatch(/^Hello page/);
    expect(
      formatWebToolPreview(
        JSON.stringify([
          { title: "GPU price", url: "https://a.example", snippet: "…" },
          { title: "Alt", url: "https://b.example" },
        ]),
      ),
    ).toContain("GPU price");
    expect(
      formatWebToolPreview(
        JSON.stringify({
          ok: true,
          results: [{ title: "Wrapped", url: "https://c.example" }],
          _untrusted: true,
        }),
      ),
    ).toContain("Wrapped");
  });
});

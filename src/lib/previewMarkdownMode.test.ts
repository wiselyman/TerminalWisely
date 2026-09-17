import { describe, expect, it } from "vitest";
import {
  normalizeMarkdownMode,
  markdownModeFromViewMode,
  viewModeForMarkdownToggle,
} from "./previewMarkdownMode";

describe("previewMarkdownMode", () => {
  it("defaults unknown/empty to wysiwyg", () => {
    expect(normalizeMarkdownMode(undefined)).toBe("wysiwyg");
    expect(normalizeMarkdownMode("")).toBe("wysiwyg");
    expect(normalizeMarkdownMode("nope")).toBe("wysiwyg");
  });

  it("keeps source and wysiwyg", () => {
    expect(normalizeMarkdownMode("source")).toBe("source");
    expect(normalizeMarkdownMode("wysiwyg")).toBe("wysiwyg");
  });

  it("migrates legacy preview to wysiwyg for markdown", () => {
    expect(normalizeMarkdownMode("preview")).toBe("wysiwyg");
    expect(markdownModeFromViewMode("preview")).toBe("wysiwyg");
    expect(markdownModeFromViewMode("source")).toBe("source");
    expect(markdownModeFromViewMode("wysiwyg")).toBe("wysiwyg");
  });

  it("toolbar targets map to store view modes", () => {
    expect(viewModeForMarkdownToggle("source")).toBe("source");
    expect(viewModeForMarkdownToggle("wysiwyg")).toBe("wysiwyg");
  });
});

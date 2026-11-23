import { describe, expect, it } from "vitest";
import { markdownFragmentHeadingIndex, resolveMarkdownLink } from "./markdownLink";

describe("resolveMarkdownLink", () => {
  it("resolves sibling and parent-relative files from the Markdown document", () => {
    expect(resolveMarkdownLink("/home/user/docs/guide.md", "./related.md")).toEqual({
      kind: "file",
      path: "/home/user/docs/related.md",
      fragment: "",
    });
    expect(resolveMarkdownLink("/home/user/docs/guide.md", "../README.md#setup")).toEqual({
      kind: "file",
      path: "/home/user/README.md",
      fragment: "setup",
    });
  });

  it("decodes URL-encoded path segments and fragments", () => {
    expect(resolveMarkdownLink("/home/user/docs/guide.md", "Chinese%20notes/%E6%96%87%E6%A1%A3.md#%E5%BC%80%E5%A7%8B")).toEqual({
      kind: "file",
      path: "/home/user/docs/Chinese notes/文档.md",
      fragment: "开始",
    });
  });

  it("leaves fragment-only and external links distinct from file targets", () => {
    expect(resolveMarkdownLink("/home/user/docs/guide.md", "#section-2")).toEqual({
      kind: "fragment",
      fragment: "section-2",
    });
    expect(resolveMarkdownLink("/home/user/docs/guide.md", "https://example.com/docs")).toEqual({
      kind: "external",
      href: "https://example.com/docs",
    });
    expect(resolveMarkdownLink("/home/user/docs/guide.md", "mailto:docs@example.com")).toEqual({
      kind: "external",
      href: "mailto:docs@example.com",
    });
    expect(resolveMarkdownLink("/home/user/docs/guide.md", "javascript:alert(1)")).toBeNull();
  });

  it("maps Markdown heading fragments to rendered heading positions", () => {
    expect(markdownFragmentHeadingIndex("# Setup Guide\n\n## 重复标题\n\n## 重复标题", "setup-guide")).toBe(0);
    expect(markdownFragmentHeadingIndex("# Setup Guide\n\n## 重复标题\n\n## 重复标题", "重复标题-1")).toBe(2);
    expect(markdownFragmentHeadingIndex("# Setup Guide", "missing")).toBe(-1);
  });
});

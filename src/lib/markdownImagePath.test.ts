import { describe, expect, it } from "vitest";
import {
  parentRemoteDir,
  resolveMarkdownImageSrc,
} from "./markdownImagePath";

describe("markdownImagePath", () => {
  it("parentRemoteDir strips filename", () => {
    expect(parentRemoteDir("/home/u/docs/a.md")).toBe("/home/u/docs");
    expect(parentRemoteDir("a.md")).toBe(".");
  });

  it("resolves relative and dotted paths", () => {
    expect(resolveMarkdownImageSrc("/home/u/docs/a.md", "img.png")).toBe(
      "/home/u/docs/img.png",
    );
    expect(resolveMarkdownImageSrc("/home/u/docs/a.md", "./x/y.png")).toBe(
      "/home/u/docs/x/y.png",
    );
    expect(resolveMarkdownImageSrc("/home/u/docs/a.md", "../pic.png")).toBe(
      "/home/u/pic.png",
    );
  });

  it("leaves remote/web/data urls alone (null = do not fetch via SSH)", () => {
    expect(resolveMarkdownImageSrc("/a.md", "https://x/y.png")).toBe(null);
    expect(resolveMarkdownImageSrc("/a.md", "http://x/y.png")).toBe(null);
    expect(resolveMarkdownImageSrc("/a.md", "data:image/png;base64,xx")).toBe(
      null,
    );
    expect(resolveMarkdownImageSrc("/a.md", "")).toBe(null);
  });
});

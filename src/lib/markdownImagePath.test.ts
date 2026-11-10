import { describe, expect, it } from "vitest";
import {
  joinMarkdownImagePath,
  joinMarkdownImagesDirectoryPath,
  markdownImageDestination,
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

  it("encodes a relative image destination without changing path separators", () => {
    expect(markdownImageDestination("diagram draft.png")).toBe("diagram%20draft.png");
    expect(markdownImageDestination("图表 1.png")).toBe("%E5%9B%BE%E8%A1%A8%201.png");
    expect(markdownImageDestination("nested/image.png")).toBe("nested/image.png");
    expect(markdownImageDestination("nested\\image draft.png")).toBe("nested/image%20draft.png");
  });

  it("joins image filenames using the document path's platform separator", () => {
    expect(joinMarkdownImagePath("/Users/a/docs/note.md", "figure.png")).toBe("/Users/a/docs/figure.png");
    expect(joinMarkdownImagePath("C:\\Users\\a\\docs\\note.md", "figure.png")).toBe("C:\\Users\\a\\docs\\figure.png");
    expect(joinMarkdownImagePath("/note.md", "figure.png")).toBe("/figure.png");
  });

  it("joins clipboard image paths under a sibling images directory", () => {
    expect(joinMarkdownImagesDirectoryPath("/Users/a/docs/note.md", "figure.png")).toBe("/Users/a/docs/images/figure.png");
    expect(joinMarkdownImagesDirectoryPath("C:\\Users\\a\\docs\\note.md", "figure.png")).toBe("C:\\Users\\a\\docs\\images\\figure.png");
  });
});

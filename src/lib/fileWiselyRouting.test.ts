import { describe, expect, it } from "vitest";
import { fileWiselyViewForPath } from "./fileWiselyRouting";

describe("fileWiselyViewForPath", () => {
  it.each([
    ["/workspace/README.md", "markdown"],
    ["/workspace/notes.MARKDOWN", "markdown"],
    ["/workspace/src/App.tsx", "editor"],
    ["/workspace/config.yaml", "editor"],
    ["/workspace/manual.pdf", "preview"],
    ["/workspace/image.PNG", "preview"],
    ["/workspace/archive.unknown", "unsupported"],
  ] as const)("routes %s to %s", (path, expected) => {
    expect(fileWiselyViewForPath(path)).toBe(expected);
  });

  it("routes extensionless paths consistently with the existing file classifier", () => {
    expect(fileWiselyViewForPath("/workspace/README")).toBe("editor");
  });
});

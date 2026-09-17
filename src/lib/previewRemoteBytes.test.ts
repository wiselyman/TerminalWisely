import { describe, expect, it } from "vitest";
import { suggestPasteImageName } from "./previewRemoteBytes";

describe("suggestPasteImageName", () => {
  it("keeps safe basename", () => {
    expect(suggestPasteImageName("Shot.PNG", 1)).toBe("Shot.PNG");
  });
  it("falls back when empty", () => {
    expect(suggestPasteImageName("", 42)).toBe("paste-42.png");
  });
  it("strips path segments", () => {
    expect(suggestPasteImageName("/tmp/a/b.jpg", 1)).toBe("b.jpg");
  });
});

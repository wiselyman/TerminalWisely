import { describe, expect, it } from "vitest";
import { suggestPasteImageName, uniquePasteImageName } from "./previewRemoteBytes";

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
  it("preserves Unicode filenames while replacing unsafe characters", () => {
    expect(suggestPasteImageName("图表 draft.png", 1)).toBe("图表 draft.png");
    expect(suggestPasteImageName("图表?.png", 1)).toBe("图表_.png");
  });
  it("chooses a collision-free filename while preserving the extension", () => {
    expect(uniquePasteImageName("chart.png", 42, [])).toBe("chart.png");
    expect(uniquePasteImageName("chart.png", 42, ["chart.png"])).toBe("chart-42.png");
    expect(uniquePasteImageName("chart.png", 42, ["chart.png", "chart-42.png"])).toBe("chart-42-1.png");
  });
});

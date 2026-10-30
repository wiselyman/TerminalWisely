import { describe, expect, it } from "vitest";
import { normalizeMarkWiselyExportPath } from "./markWiselyExportPath";

describe("MarkWisely export path", () => {
  it("uses the selected format when the save dialog returns an unrelated extension", () => {
    expect(normalizeMarkWiselyExportPath("/tmp/latest.json", "pdf")).toBe("/tmp/latest.pdf");
  });

  it("adds the selected extension when the save dialog returns a bare name", () => {
    expect(normalizeMarkWiselyExportPath("/tmp/测试", "pdf")).toBe("/tmp/测试.pdf");
  });

  it("keeps the selected extension and preserves multi-dot filenames", () => {
    expect(normalizeMarkWiselyExportPath("/tmp/weekly.notes.pdf", "pdf")).toBe("/tmp/weekly.notes.pdf");
  });

  it("normalizes extensions in Windows paths without changing the directory", () => {
    expect(normalizeMarkWiselyExportPath("C:\\Users\\me\\latest.json", "docx")).toBe("C:\\Users\\me\\latest.docx");
  });
});

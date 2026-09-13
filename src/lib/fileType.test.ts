import { describe, expect, it } from "vitest";
import {
  canPreviewPath,
  isReadonlyBinaryPreviewKind,
  previewKindFromExtension,
} from "./fileType";

describe("previewKindFromExtension", () => {
  it("classifies editable text kinds", () => {
    expect(previewKindFromExtension("rs")).toBe("text");
    expect(previewKindFromExtension("md")).toBe("markdown");
    expect(previewKindFromExtension("html")).toBe("html");
    expect(previewKindFromExtension("csv")).toBe("csv");
  });

  it("classifies readonly binary kinds (PDF native; others OFV)", () => {
    expect(previewKindFromExtension("png")).toBe("image");
    expect(previewKindFromExtension("pdf")).toBe("pdf");
    expect(previewKindFromExtension("docx")).toBe("office");
    expect(previewKindFromExtension("xlsx")).toBe("office");
    expect(previewKindFromExtension("zip")).toBe("archive");
    expect(previewKindFromExtension("mp4")).toBe("video");
    expect(previewKindFromExtension("mp3")).toBe("audio");
  });

  it("does not guess unknown binaries as text", () => {
    expect(previewKindFromExtension("img")).toBe("unsupported");
    expect(previewKindFromExtension("bin")).toBe("unsupported");
  });
});

describe("canPreviewPath", () => {
  it("allows new binary preview extensions", () => {
    expect(canPreviewPath("/tmp/report.docx")).toBe(true);
    expect(canPreviewPath("/tmp/bundle.zip")).toBe(true);
    expect(canPreviewPath("/tmp/clip.mp4")).toBe(true);
    expect(canPreviewPath("/tmp/note.unknown")).toBe(false);
  });
});

describe("isReadonlyBinaryPreviewKind", () => {
  it("marks OFV viewport kinds", () => {
    for (const kind of ["image", "pdf", "office", "archive", "video", "audio"]) {
      expect(isReadonlyBinaryPreviewKind(kind)).toBe(true);
    }
    expect(isReadonlyBinaryPreviewKind("text")).toBe(false);
    expect(isReadonlyBinaryPreviewKind("csv")).toBe(false);
  });
});

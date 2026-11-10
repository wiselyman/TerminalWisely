import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportDocument, getAvailableFormats, importDocument, importDocumentFromPath, type PandocExecutor } from "./adapters";

const renderPdf = vi.fn(async () => new Uint8Array([37, 80, 68, 70]));
vi.mock("../markWiselyPdf", () => ({ createMarkdownPdf: (...args: unknown[]) => renderPdf(...args as []) }));

beforeEach(() => renderPdf.mockClear());

describe("MarkWisely format adapters", () => {
  it("keeps Markdown round-trips source-preserving and exposes offline built-in exports", async () => {
    const markdown = "---\ntitle: Notes\n---\n\n# Heading\n\n```unlisted\nraw <x>\n```\n\n<div>kept</div>";
    const imported = await importDocument("markdown", new TextEncoder().encode(markdown));
    expect(imported).toEqual({ ok: true, source: markdown });
    expect(getAvailableFormats()).toEqual(expect.objectContaining({
      import: expect.arrayContaining(["markdown"]),
      export: expect.arrayContaining(["html", "pdf", "docx", "markdown"]),
    }));

    const html = await exportDocument("html", markdown, { title: "Notes" });
    const pdf = await exportDocument("pdf", markdown, { title: "Notes" });
    const docx = await exportDocument("docx", markdown, { title: "Notes" });
    expect(html).toMatchObject({ ok: true, mimeType: "text/html" });
    expect(pdf).toMatchObject({ ok: true, mimeType: "application/pdf", bytes: new Uint8Array([37, 80, 68, 70]) });
    expect(renderPdf).toHaveBeenCalledWith(markdown, "Notes");
    expect(docx).toMatchObject({ ok: true, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  });

  it("enables Pandoc formats only when a detected executable is supplied", () => {
    expect(getAvailableFormats().pandoc).toBe(false);
    expect(getAvailableFormats("/opt/tools/pandoc").pandoc).toBe(true);
  });

  it("uses argument arrays, preserves spaces, bounds output, and reports failed or cancelled conversions", async () => {
    const calls: Array<{ path: string; args: string[] }> = [];
    const executor: PandocExecutor = async (path, args) => {
      calls.push({ path, args });
      return { code: 0, stdout: "# imported", stderr: "" };
    };
    const path = "/Applications/Tools/pandoc binary";
    const result = await importDocument("rst", new TextEncoder().encode(".. raw:: html"), {
      pandocPath: path,
      executor,
    });
    expect(result).toEqual({ ok: true, source: "# imported" });
    expect(calls[0]).toMatchObject({ path, args: ["--from=rst", "--to=markdown", "--output=-"] });

    const failed = await exportDocument("epub", "# x", {
      pandocPath: path,
      executor: async () => ({ code: 2, stdout: "", stderr: "conversion failed" }),
    });
    expect(failed).toMatchObject({ ok: false, error: expect.stringContaining("conversion failed") });
    const controller = new AbortController();
    controller.abort();
    const cancelled = await exportDocument("epub", "# x", { pandocPath: path, executor, signal: controller.signal });
    expect(cancelled).toMatchObject({ ok: false, error: expect.stringMatching(/cancel/i) });
  });

  it("rejects unsupported formats and invalid Pandoc output without changing Markdown source", async () => {
    const source = "# unchanged\n\n```unknown\nraw\n```";
    const invalid = await importDocument("rst", new TextEncoder().encode("input"), {
      pandocPath: "/usr/bin/pandoc",
      executor: async () => ({ code: 0, stdout: "\u0000", stderr: "" }),
    });
    expect(invalid).toMatchObject({ ok: false });
    const unsupported = await exportDocument("nope", source);
    expect(unsupported).toMatchObject({ ok: false });
    expect(source).toContain("```unknown");
  });

  it("imports a binary source by path through the detected Pandoc bridge", async () => {
    const sourcePath = "/tmp/meeting notes.docx";
    const imported = await importDocumentFromPath("docx", sourcePath, {
      pandocPath: "/usr/bin/pandoc",
      importFile: async (path, format) => path === sourcePath && format === "docx" ? "# Imported notes" : "",
    });
    expect(imported).toEqual({ ok: true, source: "# Imported notes" });
    expect(await importDocumentFromPath("docx", sourcePath)).toMatchObject({ ok: false });
  });
});

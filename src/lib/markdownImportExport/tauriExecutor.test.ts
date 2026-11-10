import { describe, expect, it, vi } from "vitest";
import { createTauriPandocExecutor, createTauriPandocFileImporter } from "./tauriExecutor";

describe("Tauri Pandoc executor cancellation", () => {
  it("signals the running native conversion and reports cancellation", async () => {
    let finish!: (value: string) => void;
    const invoke = vi.fn((command: string) => {
      if (command === "markdown_pandoc_convert") return new Promise<string>((resolve) => { finish = resolve; });
      return Promise.resolve(true);
    });
    const controller = new AbortController();
    const executor = createTauriPandocExecutor(invoke, () => "conversion-42");
    const pending = executor("/usr/bin/pandoc", ["--from=markdown", "--to=epub", "--output=-"], "# hello", controller.signal);
    controller.abort();
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledWith("markdown_pandoc_cancel", { requestId: "conversion-42" });
    finish("ignored result");
    expect(await pending).toMatchObject({ code: 1, stderr: "Conversion cancelled." });
  });

  it("signals cancellation while Pandoc reads a binary source file", async () => {
    let finish!: (value: string) => void;
    const invoke = vi.fn((command: string) => {
      if (command === "markdown_pandoc_import_file") return new Promise<string>((resolve) => { finish = resolve; });
      return Promise.resolve(true);
    });
    const controller = new AbortController();
    const importer = createTauriPandocFileImporter(invoke, () => "import-84");
    const pending = importer("/tmp/report.docx", "docx", controller.signal);
    controller.abort();
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledWith("markdown_pandoc_cancel", { requestId: "import-84" });
    finish("ignored result");
    await expect(pending).rejects.toThrow("cancelled");
  });
});

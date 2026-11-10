import { createMarkdownDocx, renderMarkdownHtml } from "../markWiselyExport";
import { createMarkdownPdf } from "../markWiselyPdf";

export const BUILTIN_EXPORT_FORMATS = ["markdown", "html", "pdf", "docx"] as const;
export const BUILTIN_IMPORT_FORMATS = ["markdown"] as const;
const MAX_CONVERSION_BYTES = 32 * 1024 * 1024;

export type BuiltinFormat = (typeof BUILTIN_EXPORT_FORMATS)[number];
export type ProcessResult = { code: number; stdout: string; stderr: string };
export type PandocExecutor = (path: string, args: string[], input: string, signal?: AbortSignal) => Promise<ProcessResult>;
export type PandocFileImporter = (path: string, format: string, signal?: AbortSignal) => Promise<string>;
export type AdapterOptions = { pandocPath?: string; executor?: PandocExecutor; importFile?: PandocFileImporter; signal?: AbortSignal };
export type ImportResult = { ok: true; source: string } | { ok: false; error: string };
export type ExportResult = { ok: true; bytes: Uint8Array; mimeType: string } | { ok: false; error: string };

export function getAvailableFormats(pandocPath?: string) {
  return {
    import: [...BUILTIN_IMPORT_FORMATS],
    export: [...BUILTIN_EXPORT_FORMATS],
    pandoc: Boolean(pandocPath?.trim()),
  };
}

function bytesToText(bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_CONVERSION_BYTES) throw new Error("Document exceeds the conversion size limit.");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Conversion cancelled.");
}

async function convertWithPandoc(format: string, direction: "import" | "export", source: string, options: AdapterOptions): Promise<string> {
  assertNotAborted(options.signal);
  if (!options.pandocPath?.trim() || !options.executor) throw new Error("Pandoc is unavailable. Install Pandoc to use this format.");
  const from = direction === "import" ? format : "markdown";
  const to = direction === "import" ? "markdown" : format;
  const result = await options.executor(options.pandocPath, [`--from=${from}`, `--to=${to}`, "--output=-"], source, options.signal);
  assertNotAborted(options.signal);
  if (result.stdout.length > MAX_CONVERSION_BYTES) throw new Error("Pandoc output exceeds the conversion size limit.");
  if (result.code !== 0) throw new Error(result.stderr.trim() || `Pandoc exited with status ${result.code}.`);
  if (result.stdout.includes("\u0000")) throw new Error("Pandoc returned invalid document output.");
  return result.stdout;
}

export async function importDocument(format: string, bytes: Uint8Array, options: AdapterOptions = {}): Promise<ImportResult> {
  try {
    const text = bytesToText(bytes);
    if (format === "markdown" || format === "md") return { ok: true, source: text };
    return { ok: true, source: await convertWithPandoc(format, "import", text, options) };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}

export async function importDocumentFromPath(format: string, path: string, options: AdapterOptions = {}): Promise<ImportResult> {
  try {
    assertNotAborted(options.signal);
    if (!path.trim()) throw new Error("Choose a document to import.");
    if (!options.pandocPath?.trim() || !options.importFile) throw new Error("Pandoc is unavailable. Install Pandoc to import this format.");
    const source = await options.importFile(path, format, options.signal);
    assertNotAborted(options.signal);
    if (source.length > MAX_CONVERSION_BYTES) throw new Error("Imported Markdown exceeds the conversion size limit.");
    if (source.includes("\u0000")) throw new Error("Pandoc returned invalid document output.");
    return { ok: true, source };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}

export async function exportDocument(format: string, source: string, options: AdapterOptions & { title?: string } = {}): Promise<ExportResult> {
  try {
    assertNotAborted(options.signal);
    const title = options.title ?? "Untitled";
    if (format === "markdown" || format === "md") return { ok: true, bytes: new TextEncoder().encode(source), mimeType: "text/markdown" };
    if (format === "html") return { ok: true, bytes: new TextEncoder().encode(renderMarkdownHtml(source, title)), mimeType: "text/html" };
    if (format === "pdf") return { ok: true, bytes: await createMarkdownPdf(source, title), mimeType: "application/pdf" };
    if (format === "docx") return { ok: true, bytes: await createMarkdownDocx(source, title), mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    const converted = await convertWithPandoc(format, "export", source, options);
    return { ok: true, bytes: new TextEncoder().encode(converted), mimeType: "application/octet-stream" };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}

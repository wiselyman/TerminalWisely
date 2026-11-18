export const EDITOR_WISELY_MAX_BYTES = 2 * 1024 * 1024;

export type TextFormat = { bom: boolean; newline: "\n" | "\r\n" };

export function decodeEditorText(bytes: Uint8Array): { text: string; format: TextFormat } {
  if (bytes.byteLength > EDITOR_WISELY_MAX_BYTES) throw new Error("file_too_large");
  if (bytes.includes(0)) throw new Error("binary_file");
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const payload = bom ? bytes.subarray(3) : bytes;
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(payload); }
  catch { throw new Error("unsupported_encoding"); }
  return { text: text.replace(/\r\n/g, "\n"), format: { bom, newline: /\r\n/.test(text) ? "\r\n" : "\n" } };
}

export function encodeEditorText(text: string, format: TextFormat): Uint8Array {
  const normalized = format.newline === "\r\n" ? text.replace(/\r?\n/g, "\r\n") : text.replace(/\r\n/g, "\n");
  const body = new TextEncoder().encode(normalized);
  if (!format.bom) return body;
  const result = new Uint8Array(body.length + 3);
  result.set([0xef, 0xbb, 0xbf]); result.set(body, 3);
  return result;
}

const modes: Record<string, string> = {
  c: "c", h: "cpp", cc: "cpp", hh: "cpp", cpp: "cpp", hpp: "cpp", hxx: "cpp", cxx: "cpp", rs: "rust", py: "python",
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx", ts: "typescript", mts: "typescript", cts: "typescript", tsx: "tsx", json: "json", md: "markdown",
  html: "html", css: "css", sass: "sass", scss: "sass", xml: "xml", yaml: "yaml", yml: "yaml", toml: "toml",
  sh: "shell", bash: "shell", zsh: "shell", fish: "shell", ksh: "shell", sql: "sql", go: "go", java: "java", kt: "kotlin",
  swift: "swift", rb: "ruby", php: "php", ini: "properties", conf: "properties", txt: "text",
  log: "text", env: "properties", dockerfile: "dockerfile",
};
export function editorLanguageForPath(path: string): string {
  const base = path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (base === "dockerfile" || base.startsWith("dockerfile.")) return "dockerfile";
  if (base === "makefile" || base === "gnumakefile") return "makefile";
  return modes[base.split(".").pop() ?? ""] ?? "text";
}

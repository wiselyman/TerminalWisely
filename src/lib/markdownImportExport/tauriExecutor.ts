import type { PandocExecutor } from "./adapters";

export type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export function createTauriPandocExecutor(
  invoke: TauriInvoke,
  createRequestId: () => string = () => globalThis.crypto.randomUUID(),
): PandocExecutor {
  return async (_path, args, input, signal) => {
    if (signal?.aborted) return { code: 1, stdout: "", stderr: "Conversion cancelled." };
    const requestId = createRequestId();
    const from = args.find((argument) => argument.startsWith("--from="))?.slice(7) ?? "markdown";
    const to = args.find((argument) => argument.startsWith("--to="))?.slice(5) ?? "markdown";
    const cancel = () => {
      void invoke("markdown_pandoc_cancel", { requestId }).catch(() => undefined);
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const stdout = await invoke("markdown_pandoc_convert", { requestId, from, to, input });
      if (signal?.aborted) return { code: 1, stdout: "", stderr: "Conversion cancelled." };
      return { code: 0, stdout: typeof stdout === "string" ? stdout : "", stderr: "" };
    } catch (cause) {
      return {
        code: 1,
        stdout: "",
        stderr: signal?.aborted ? "Conversion cancelled." : cause instanceof Error ? cause.message : String(cause),
      };
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  };
}

export function createTauriPandocFileImporter(
  invoke: TauriInvoke,
  createRequestId: () => string = () => globalThis.crypto.randomUUID(),
): (path: string, format: string, signal?: AbortSignal) => Promise<string> {
  return async (path, format, signal) => {
    if (signal?.aborted) throw new Error("Conversion cancelled.");
    const requestId = createRequestId();
    const cancel = () => {
      void invoke("markdown_pandoc_cancel", { requestId }).catch(() => undefined);
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const result = await invoke("markdown_pandoc_import_file", { requestId, from: format, path });
      if (signal?.aborted) throw new Error("Conversion cancelled.");
      if (typeof result !== "string") throw new Error("Pandoc returned invalid document output.");
      return result;
    } catch (cause) {
      if (signal?.aborted) throw new Error("Conversion cancelled.");
      throw cause instanceof Error ? cause : new Error(String(cause));
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  };
}

import { isTauriRuntime } from "./isTauri";

/**
 * Prefer Tauri native clipboard. WKWebView's navigator.clipboard often throws
 * NotAllowedError (and shows a floating Paste control) outside a tight user gesture.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (isTauriRuntime()) {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}

export async function readClipboardText(): Promise<string> {
  if (isTauriRuntime()) {
    const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
    return (await readText()) ?? "";
  }
  return navigator.clipboard.readText();
}

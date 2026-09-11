/** Open http(s) URLs in the OS default browser (never the app WebView). */

import { openUrl } from "@tauri-apps/plugin-opener";

export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function openExternalUrl(url: string): Promise<void> {
  const trimmed = (url || "").trim();
  if (!isHttpUrl(trimmed)) {
    throw new Error("external_url_not_http");
  }
  await openUrl(trimmed);
}

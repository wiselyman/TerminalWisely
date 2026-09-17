import { invoke } from "@tauri-apps/api/core";

export function suggestPasteImageName(
  originalName: string,
  nowMs: number,
): string {
  const base = originalName.replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
  if (!base || base === "." || base === "..") return `paste-${nowMs}.png`;
  return base.replace(/[^\w.\-()+ ]+/g, "_");
}

export async function readPreviewRemoteBytes(
  sessionId: string,
  remotePath: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const res = await invoke<{ base64: string; mime_hint: string }>(
    "preview_read_bytes",
    {
      request: {
        session_id: sessionId,
        path: remotePath,
      },
    },
  );
  const bin = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
  return { bytes: bin, mime: res.mime_hint || "application/octet-stream" };
}

export async function writePreviewRemoteBytes(
  sessionId: string,
  remotePath: string,
  bytes: Uint8Array,
): Promise<void> {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);
  await invoke("preview_write_bytes", {
    request: {
      session_id: sessionId,
      path: remotePath,
      base64,
    },
  });
}

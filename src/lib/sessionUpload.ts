import { invoke } from "@tauri-apps/api/core";
import { createTransferId } from "./transferId";
import { useSessionStore } from "../stores/sessionStore";
import type { UploadFileResult } from "../types";

function uploadLabel(localPaths: string[]): string {
  if (localPaths.length === 1) {
    const path = localPaths[0];
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || path;
  }
  return `${localPaths.length} 个文件`;
}

export async function uploadLocalPathsToSession(
  sessionId: string,
  localPaths: string[],
): Promise<UploadFileResult[]> {
  const transferId = createTransferId();
  useSessionStore.getState().upsertTransfer({
    transfer_id: transferId,
    session_id: sessionId,
    filename: uploadLabel(localPaths),
    transferred: 0,
    total: 0,
    direction: "upload",
  });

  try {
    return await invoke<UploadFileResult[]>("upload_files", {
      request: {
        session_id: sessionId,
        local_paths: localPaths,
        remote_dir: null,
        transfer_id: transferId,
      },
    });
  } catch (err) {
    useSessionStore.getState().removeTransfer(transferId);
    throw err;
  }
}
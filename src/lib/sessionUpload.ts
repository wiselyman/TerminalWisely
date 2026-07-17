import { invoke } from "@tauri-apps/api/core";
import i18n from "../i18n";
import { invokeWithSudoRetry } from "./invokeWithSudoRetry";
import { createTransferId } from "./transferId";
import { useSessionStore } from "../stores/sessionStore";
import type { UploadFileResult } from "../types";

function uploadLabel(localPaths: string[]): string {
  if (localPaths.length === 1) {
    const path = localPaths[0];
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || path;
  }
  return i18n.t("tools:transfer.filesCount", { count: localPaths.length });
}

export async function uploadLocalPathsToSession(
  sessionId: string,
  localPaths: string[],
  remoteDir?: string | null,
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
    return await invokeWithSudoRetry(
      (sudoPassword) =>
        invoke<UploadFileResult[]>("upload_files", {
          request: {
            session_id: sessionId,
            local_paths: localPaths,
            remote_dir: remoteDir ?? null,
            transfer_id: transferId,
            sudo_password: sudoPassword ?? null,
          },
        }),
      { action: i18n.t("tools:transfer.directionUpload") },
    );
  } catch (err) {
    useSessionStore.getState().removeTransfer(transferId);
    throw err;
  }
}

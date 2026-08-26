import { invoke } from "@tauri-apps/api/core";
import i18n from "../i18n";
import { invokeWithSudoRetry } from "./invokeWithSudoRetry";
import { createTransferId } from "./transferId";
import { useDownloadSettingsStore } from "../stores/downloadSettingsStore";
import { useSessionStore } from "../stores/sessionStore";
import { useToastStore } from "../stores/toastStore";

function joinLocalPath(dir: string, fileName: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir.replace(/[/\\]+$/, "")}${sep}${fileName}`;
}

let firstDownloadHintShown = false;

export async function downloadRemotePath(
  sessionId: string,
  remotePath: string,
  kind: "file" | "directory",
): Promise<string> {
  const transferId = createTransferId();
  const baseName =
    remotePath.split("/").pop() ||
    remotePath.split("\\").pop() ||
    remotePath;
  const downloadName = kind === "directory" ? `${baseName}.tar.gz` : baseName;

  useSessionStore.getState().upsertTransfer({
    transfer_id: transferId,
    session_id: sessionId,
    filename: downloadName,
    transferred: 0,
    total: 0,
    direction: "download",
  });

  const hadDir = Boolean(useDownloadSettingsStore.getState().preferredDownloadDir);
  const preferredDir = await useDownloadSettingsStore.getState().ensureDownloadDirectory();
  const local_path = joinLocalPath(preferredDir, downloadName);

  if (!hadDir && !firstDownloadHintShown) {
    firstDownloadHintShown = true;
    useToastStore.getState().pushToast(
      i18n.t("shell:downloadDirFirstSet", { path: preferredDir }),
      true,
    );
  }

  const command = kind === "directory" ? "download_directory" : "download_file";

  try {
    return await invokeWithSudoRetry(
      (sudoPassword) =>
        invoke<string>(command, {
          request: {
            session_id: sessionId,
            remote_path: remotePath,
            local_path,
            transfer_id: transferId,
            sudo_password: sudoPassword ?? null,
          },
        }),
      { action: i18n.t("tools:transfer.directionDownload"), path: remotePath },
    );
  } catch (err) {
    useSessionStore.getState().removeTransfer(transferId);
    throw err;
  }
}

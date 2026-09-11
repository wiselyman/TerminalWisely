/** In-app update check / download via Tauri updater + GitHub Releases. */

import { invoke } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauriRuntime } from "./isTauri";

export const RELEASES_URL =
  "https://github.com/wiselyman/TerminalWisely/releases";

export interface UpdateTargetInfo {
  target: string;
  arch: string;
  os: string;
  linux_kind: "app_image" | "deb" | "rpm" | "unknown" | null;
}

export interface UpdateCheckResult {
  update: Update | null;
  target: string;
  currentVersion: string;
  needsPrivilege: boolean;
}

export async function getAppVersion(): Promise<string> {
  if (!isTauriRuntime()) return "0.0.0";
  return invoke<string>("get_app_version");
}

export async function getUpdateTarget(): Promise<UpdateTargetInfo> {
  if (!isTauriRuntime()) {
    return {
      target: "darwin-aarch64",
      arch: "aarch64",
      os: "darwin",
      linux_kind: null,
    };
  }
  return invoke<UpdateTargetInfo>("get_update_target");
}

export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = await getAppVersion();
  const info = await getUpdateTarget();
  if (!isTauriRuntime()) {
    return {
      update: null,
      target: info.target,
      currentVersion,
      needsPrivilege: false,
    };
  }
  const update = await check({ target: info.target });
  const needsPrivilege =
    info.linux_kind === "deb" || info.linux_kind === "rpm";
  return {
    update,
    target: info.target,
    currentVersion,
    needsPrivilege,
  };
}

export type DownloadProgress = {
  downloaded: number;
  contentLength: number | null;
};

export async function downloadAndInstallUpdate(
  update: Update,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  let downloaded = 0;
  let contentLength: number | null = null;
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        contentLength = event.data.contentLength ?? null;
        downloaded = 0;
        onProgress?.({ downloaded, contentLength });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.({ downloaded, contentLength });
        break;
      case "Finished":
        onProgress?.({ downloaded, contentLength });
        break;
    }
  });
}

export async function relaunchApp(): Promise<void> {
  await relaunch();
}

export async function openReleasesPage(): Promise<void> {
  if (isTauriRuntime()) {
    await openUrl(RELEASES_URL);
  } else {
    window.open(RELEASES_URL, "_blank", "noopener,noreferrer");
  }
}

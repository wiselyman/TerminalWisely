import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import i18n from "../i18n";

const DOWNLOAD_DIR_KEY = "tw.localFs.downloadDir";

function loadPreferredDownloadDir(): string | null {
  try {
    return localStorage.getItem(DOWNLOAD_DIR_KEY);
  } catch {
    return null;
  }
}

interface DownloadSettingsState {
  preferredDownloadDir: string | null;
  settingsOpen: boolean;
  setPreferredDownloadDir: (path: string | null) => void;
  setSettingsOpen: (open: boolean) => void;
  pickDownloadDirectory: (title?: string) => Promise<string | null>;
  ensureDownloadDirectory: () => Promise<string>;
  loadSystemDefault: () => Promise<string>;
}

export const useDownloadSettingsStore = create<DownloadSettingsState>((set, get) => ({
  preferredDownloadDir: loadPreferredDownloadDir(),
  settingsOpen: false,

  setPreferredDownloadDir: (path) => {
    if (path) {
      localStorage.setItem(DOWNLOAD_DIR_KEY, path);
    } else {
      localStorage.removeItem(DOWNLOAD_DIR_KEY);
    }
    set({ preferredDownloadDir: path });
  },

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  pickDownloadDirectory: async (title) => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({
      directory: true,
      multiple: false,
      title: title ?? i18n.t("shell:settingsChooseFolder"),
    });
    return typeof picked === "string" ? picked : null;
  },

  ensureDownloadDirectory: async () => {
    const existing = get().preferredDownloadDir;
    if (existing) return existing;

    const picked = await get().pickDownloadDirectory(
      i18n.t("shell:settingsFirstDownloadPrompt"),
    );
    if (picked) {
      get().setPreferredDownloadDir(picked);
      return picked;
    }

    const fallback = await get().loadSystemDefault();
    get().setPreferredDownloadDir(fallback);
    return fallback;
  },

  loadSystemDefault: async () => {
    return invoke<string>("get_default_download_dir");
  },
}));

export function openAppSettings() {
  useDownloadSettingsStore.getState().setSettingsOpen(true);
}

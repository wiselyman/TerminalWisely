/** Pending in-app update state (quiet check → badge; confirm before download). */

import { create } from "zustand";
import type { Update } from "@tauri-apps/plugin-updater";
import { checkForAppUpdate } from "../lib/appUpdater";

export type PendingAppUpdate = {
  update: Update;
  currentVersion: string;
  needsPrivilege: boolean;
};

interface AppUpdateState {
  /** Drives the sidebar badge; cleared after a successful install. */
  pending: PendingAppUpdate | null;
  /** Snapshot for the confirm/progress dialog (survives install clearing badge). */
  dialog: PendingAppUpdate | null;
  checking: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  /** After install: drop badge, keep dialog open for restart prompt. */
  markInstalled: () => void;
  /** Quiet check: set badge only, do not open dialog. */
  quietCheck: () => Promise<void>;
  /** Manual check: opens dialog if update found. */
  manualCheck: () => Promise<
    | { status: "available" }
    | { status: "up-to-date"; version: string }
    | { status: "error"; message: string }
  >;
}

export const useAppUpdateStore = create<AppUpdateState>((set, get) => ({
  pending: null,
  dialog: null,
  checking: false,

  openDialog: () => {
    const pending = get().pending;
    if (pending) set({ dialog: pending });
  },

  closeDialog: () => set({ dialog: null }),

  markInstalled: () => set({ pending: null }),

  quietCheck: async () => {
    try {
      const result = await checkForAppUpdate();
      if (!result.update) {
        set({ pending: null });
        return;
      }
      set({
        pending: {
          update: result.update,
          currentVersion: result.currentVersion,
          needsPrivilege: result.needsPrivilege,
        },
      });
    } catch {
      /* network / unsigned channel — keep prior pending if any */
    }
  },

  manualCheck: async () => {
    set({ checking: true });
    try {
      const result = await checkForAppUpdate();
      if (!result.update) {
        set({ pending: null, dialog: null });
        return { status: "up-to-date", version: result.currentVersion };
      }
      const payload = {
        update: result.update,
        currentVersion: result.currentVersion,
        needsPrivilege: result.needsPrivilege,
      };
      set({ pending: payload, dialog: payload });
      return { status: "available" };
    } catch (err) {
      return {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    } finally {
      set({ checking: false });
    }
  },
}));

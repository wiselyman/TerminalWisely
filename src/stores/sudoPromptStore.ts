import { create } from "zustand";
import i18n from "../i18n";

export const SUDO_CANCELLED = "SUDO_CANCELLED";

export interface SudoPromptRequest {
  action: string;
  /** File path or shell command shown for user confirmation. */
  path: string;
  /** Optional explicit command (preferred over path). */
  command?: string;
}

interface SudoPromptState {
  open: boolean;
  action: string;
  path: string;
  command: string;
  password: string;
  pending: boolean;
  resolve: ((password: string) => void) | null;
  reject: ((reason?: Error) => void) | null;
  setPassword: (password: string) => void;
  submit: () => void;
  cancel: () => void;
}

export const useSudoPromptStore = create<SudoPromptState>((set, get) => ({
  open: false,
  action: "",
  path: "",
  command: "",
  password: "",
  pending: false,
  resolve: null,
  reject: null,
  setPassword: (password) => set({ password }),
  submit: () => {
    const { password, resolve } = get();
    if (!password.trim() || !resolve) return;
    resolve(password);
    set({
      open: false,
      password: "",
      pending: false,
      resolve: null,
      reject: null,
    });
  },
  cancel: () => {
    const { reject } = get();
    reject?.(new Error(SUDO_CANCELLED));
    set({
      open: false,
      password: "",
      pending: false,
      resolve: null,
      reject: null,
    });
  },
}));

export function requestSudoPassword(request: SudoPromptRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    useSudoPromptStore.setState({
      open: true,
      action: request.action,
      path: request.path,
      command: request.command ?? "",
      password: "",
      pending: false,
      resolve,
      reject,
    });
  });
}

export function isSudoCancelled(err: unknown): boolean {
  const msg = String(err ?? "");
  return msg.includes(SUDO_CANCELLED);
}

export function extractPathFromSudoError(message: string): string {
  const match = message.match(/`([^`]+)`/);
  return match?.[1] ?? "";
}

export function extractActionFromSudoError(message: string): string {
  const match = message.match(/PREVIEW_SUDO_REQUIRED:\s*(\S+)/);
  return match?.[1] ?? i18n.t("common:genericAction");
}

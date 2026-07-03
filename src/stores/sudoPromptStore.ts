import { create } from "zustand";

export interface SudoPromptRequest {
  action: string;
  path: string;
}

interface SudoPromptState {
  open: boolean;
  action: string;
  path: string;
  password: string;
  pending: boolean;
  resolve: ((password: string) => void) | null;
  reject: (() => void) | null;
  setPassword: (password: string) => void;
  submit: () => void;
  cancel: () => void;
}

export const useSudoPromptStore = create<SudoPromptState>((set, get) => ({
  open: false,
  action: "",
  path: "",
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
    reject?.();
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
      password: "",
      pending: false,
      resolve,
      reject,
    });
  });
}

export function extractPathFromSudoError(message: string): string {
  const match = message.match(/`([^`]+)`/);
  return match?.[1] ?? "";
}

export function extractActionFromSudoError(message: string): string {
  const match = message.match(/PREVIEW_SUDO_REQUIRED:\s*(\S+)/);
  return match?.[1] ?? "操作";
}

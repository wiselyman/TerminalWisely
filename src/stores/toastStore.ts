import { create } from "zustand";
import type { ToastItem } from "../types";

interface ToastState {
  toasts: ToastItem[];
  pushToast: (message: string, success: boolean) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  pushToast: (message, success) => {
    const id = crypto.randomUUID();
    const text = String(message || "").trim() || (success ? "OK" : "Error");
    set((state) => ({
      // Keep a short queue; status bar shows the newest.
      toasts: [...state.toasts.slice(-4), { id, message: text, success }],
    }));
    window.setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((toast) => toast.id !== id),
      }));
    }, 6000);
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
}));

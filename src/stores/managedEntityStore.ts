import { create } from "zustand";
import type { ManagedEntityRef, ManagedKind } from "../lib/management/types";

interface ManagedEntityState {
  /** Shared Home surface for Hosts and Kubernetes. */
  homeOpen: boolean;
  /** Last focused entity per management domain. */
  focusedByKind: Partial<Record<ManagedKind, ManagedEntityRef>>;
  openHome: () => void;
  leaveHome: () => void;
  focus: (ref: ManagedEntityRef) => void;
  clear: (kind?: ManagedKind) => void;
  /** Focused entity for the given kind (defaults to latest of that kind). */
  focused: (kind: ManagedKind) => ManagedEntityRef | null;
}

export const useManagedEntityStore = create<ManagedEntityState>((set, get) => ({
  homeOpen: true,
  focusedByKind: {},

  openHome: () => set({ homeOpen: true }),

  leaveHome: () => set({ homeOpen: false }),

  focus: (ref) => {
    set((s) => ({
      homeOpen: false,
      focusedByKind: { ...s.focusedByKind, [ref.kind]: ref },
    }));
  },

  clear: (kind) => {
    if (!kind) {
      set({ focusedByKind: {} });
      return;
    }
    set((s) => {
      const next = { ...s.focusedByKind };
      delete next[kind];
      return { focusedByKind: next };
    });
  },

  focused: (kind) => get().focusedByKind[kind] ?? null,
}));

export function focusManagedEntity(ref: ManagedEntityRef) {
  useManagedEntityStore.getState().focus(ref);
}

export function openManagedHome() {
  useManagedEntityStore.getState().openHome();
}

export function leaveManagedHome() {
  useManagedEntityStore.getState().leaveHome();
}

import { create } from "zustand";
import type { ManagedEntityRef, ManagedKind } from "../lib/management/types";

interface ManagedEntityState {
  /** Home provides the local Terminal and local chat. */
  homeOpen: boolean;
  /** Shows the host directory instead of the local terminal workspace. */
  homeDirectoryOpen: boolean;
  homeDesktopTabs: { id: string; title: string }[];
  activeHomeDesktopTabId: string | null;
  /** Home local chat starts collapsed and is independent of workspace AI panels. */
  homeChatOpen: boolean;
  /** Last focused entity per management domain. */
  focusedByKind: Partial<Record<ManagedKind, ManagedEntityRef>>;
  openHome: () => void;
  showHomeDirectory: () => void;
  showHomeWorkspace: () => void;
  openHomeDesktopTab: () => string;
  activateHomeDesktopTab: (id: string) => void;
  closeHomeDesktopTab: (id: string) => void;
  leaveHome: () => void;
  setHomeChatOpen: (open: boolean) => void;
  toggleHomeChat: () => void;
  focus: (ref: ManagedEntityRef) => void;
  clear: (kind?: ManagedKind) => void;
  /** Focused entity for the given kind (defaults to latest of that kind). */
  focused: (kind: ManagedKind) => ManagedEntityRef | null;
}

export const useManagedEntityStore = create<ManagedEntityState>((set, get) => ({
  homeOpen: true,
  homeDirectoryOpen: true,
  homeDesktopTabs: [],
  activeHomeDesktopTabId: null,
  homeChatOpen: false,
  focusedByKind: {},

  openHome: () => set({ homeOpen: true, homeDirectoryOpen: true, homeChatOpen: false, activeHomeDesktopTabId: null }),

  showHomeDirectory: () => set({ homeOpen: true, homeDirectoryOpen: true, homeChatOpen: false }),

  showHomeWorkspace: () => set({ homeOpen: true, homeDirectoryOpen: false, activeHomeDesktopTabId: null }),

  openHomeDesktopTab: () => {
    const id = `local-desktop-${crypto.randomUUID()}`;
    set((state) => ({
      homeOpen: true,
      homeDirectoryOpen: false,
      homeChatOpen: false,
      homeDesktopTabs: [...state.homeDesktopTabs, { id, title: "Local Desktop" }],
      activeHomeDesktopTabId: id,
    }));
    return id;
  },

  activateHomeDesktopTab: (id) => set((state) => ({
    homeOpen: true,
    homeDirectoryOpen: false,
    homeChatOpen: false,
    activeHomeDesktopTabId: state.homeDesktopTabs.some((tab) => tab.id === id) ? id : state.activeHomeDesktopTabId,
  })),

  closeHomeDesktopTab: (id) => set((state) => {
    const remaining = state.homeDesktopTabs.filter((tab) => tab.id !== id);
    if (state.activeHomeDesktopTabId !== id) return { homeDesktopTabs: remaining };
    return {
      homeDesktopTabs: remaining,
      activeHomeDesktopTabId: remaining[remaining.length - 1]?.id ?? null,
      homeDirectoryOpen: remaining.length === 0,
    };
  }),

  leaveHome: () => set({ homeOpen: false, homeDirectoryOpen: false }),

  setHomeChatOpen: (homeChatOpen) => set({ homeChatOpen }),

  toggleHomeChat: () => set((state) => ({ homeChatOpen: !state.homeChatOpen })),

  focus: (ref) => {
    set((s) => ({
      homeOpen: false,
      homeDirectoryOpen: false,
      activeHomeDesktopTabId: null,
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

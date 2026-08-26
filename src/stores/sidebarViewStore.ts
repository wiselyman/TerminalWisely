import { create } from "zustand";
import { useAiEngineerStore } from "./aiEngineerStore";
import { useManagedEntityStore } from "./managedEntityStore";

export type SidebarView = "hosts" | "k8s";

const STORAGE_KEY = "tw.sidebar.view";

function loadView(): SidebarView {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "k8s" ? "k8s" : "hosts";
  } catch {
    return "hosts";
  }
}

interface SidebarViewState {
  view: SidebarView;
  setView: (view: SidebarView) => void;
}

export const useSidebarViewStore = create<SidebarViewState>((set) => ({
  view: loadView(),
  setView: (view) => {
    try {
      localStorage.setItem(STORAGE_KEY, view);
    } catch {
      /* ignore */
    }
    useAiEngineerStore
      .getState()
      .setEngineerMode(view === "k8s" ? "k8s" : "linux");
    const focused =
      useManagedEntityStore
        .getState()
        .focused(view === "k8s" ? "cluster" : "server");
    if (focused) {
      useAiEngineerStore.getState().bindManagedEntity(focused);
    }
    set({ view });
  },
}));

// Sync engineer mode on cold start.
useAiEngineerStore
  .getState()
  .setEngineerMode(loadView() === "k8s" ? "k8s" : "linux");

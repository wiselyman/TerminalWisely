import { create } from "zustand";
import { useAiEngineerStore } from "./aiEngineerStore";
import { useManagedEntityStore } from "./managedEntityStore";

export type SidebarView = "hosts";

const STORAGE_KEY = "tw.sidebar.view";

function loadView(): SidebarView {
  try {
    const view = localStorage.getItem(STORAGE_KEY);
    if (view !== "hosts") localStorage.setItem(STORAGE_KEY, "hosts");
    localStorage.removeItem("tw.entityLayout.k8s");
    localStorage.removeItem("tw.entityLayout.db");
    localStorage.removeItem("tw.k8s.detailPercent");
  } catch {
    /* local storage may be unavailable in an embedded webview */
  }
  return "hosts";
}

interface SidebarViewState {
  view: SidebarView;
  setView: (view: SidebarView) => void;
}

export const useSidebarViewStore = create<SidebarViewState>((set) => ({
  view: loadView(),
  setView: () => {
    try {
      localStorage.setItem(STORAGE_KEY, "hosts");
    } catch {
      /* ignore */
    }
    const focused = useManagedEntityStore.getState().focused("server");
    if (focused) useAiEngineerStore.getState().bindManagedEntity(focused);
    set({ view: "hosts" });
  },
}));

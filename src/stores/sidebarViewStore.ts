import { create } from "zustand";
import { useAiEngineerStore } from "./aiEngineerStore";
import { useFindStore } from "./findStore";
import { useLocalFsStore } from "./localFsStore";
import { useManagedEntityStore } from "./managedEntityStore";
import { useTaskManagerStore } from "./taskManagerStore";

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

/** Hosts-only right panels must not linger after switching to K8s. */
function closeHostsWorkspacePanels() {
  useLocalFsStore.getState().close();
  useTaskManagerStore.getState().close();
  useFindStore.getState().close();
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

    if (view === "k8s") {
      closeHostsWorkspacePanels();
    }

    const focused =
      useManagedEntityStore
        .getState()
        .focused(view === "k8s" ? "cluster" : "server");
    if (focused) {
      useAiEngineerStore.getState().bindManagedEntity(focused);
    } else if (view === "k8s") {
      useAiEngineerStore.getState().close({ force: true });
    }
    set({ view });
  },
}));

// Sync engineer mode on cold start.
useAiEngineerStore
  .getState()
  .setEngineerMode(loadView() === "k8s" ? "k8s" : "linux");

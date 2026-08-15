import { create } from "zustand";

const PINNED_KEY = "tw.workspacePanel.pinnedId";

export type PinnablePanelId =
  | "aiEngineer"
  | "taskManager"
  | "find"
  | "commandNav";

function writePinnedId(id: PinnablePanelId | null) {
  try {
    if (id) localStorage.setItem(PINNED_KEY, id);
    else localStorage.removeItem(PINNED_KEY);
  } catch {
    /* ignore */
  }
}

function readPinnedId(): PinnablePanelId | null {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    if (
      raw === "aiEngineer" ||
      raw === "taskManager" ||
      raw === "find" ||
      raw === "commandNav"
    ) {
      return raw;
    }
    if (raw === "hostStats") {
      localStorage.removeItem(PINNED_KEY);
      return null;
    }
    if (localStorage.getItem("tw.aiEngineer.panelPinned") === "1") {
      writePinnedId("aiEngineer");
      localStorage.removeItem("tw.aiEngineer.panelPinned");
      return "aiEngineer";
    }
  } catch {
    /* ignore */
  }
  return null;
}

type State = {
  pinnedId: PinnablePanelId | null;
  isPinned: (id: PinnablePanelId) => boolean;
  setPinned: (id: PinnablePanelId, pinned: boolean) => void;
  togglePinned: (id: PinnablePanelId) => void;
};

export const useWorkspacePanelPinStore = create<State>((set, get) => ({
  pinnedId: readPinnedId(),
  isPinned: (id) => get().pinnedId === id,
  setPinned: (id, pinned) => {
    const next = pinned ? id : get().pinnedId === id ? null : get().pinnedId;
    writePinnedId(next);
    set({ pinnedId: next });
  },
  togglePinned: (id) => {
    get().setPinned(id, get().pinnedId !== id);
  },
}));

import { create } from "zustand";

const PINNED_KEY = "tw.workspacePanel.pinned";
const LEGACY_PINNED_ID_KEY = "tw.workspacePanel.pinnedId";

function writePinned(pinned: boolean) {
  try {
    if (pinned) localStorage.setItem(PINNED_KEY, "1");
    else localStorage.removeItem(PINNED_KEY);
  } catch {
    /* ignore */
  }
}

function readPinned(): boolean {
  try {
    if (localStorage.getItem(PINNED_KEY) === "1") return true;

    const legacyId = localStorage.getItem(LEGACY_PINNED_ID_KEY);
    if (
      legacyId === "aiEngineer" ||
      legacyId === "taskManager" ||
      legacyId === "find" ||
      legacyId === "commandNav"
    ) {
      writePinned(true);
      localStorage.removeItem(LEGACY_PINNED_ID_KEY);
      return true;
    }
    if (legacyId === "hostStats") {
      localStorage.removeItem(LEGACY_PINNED_ID_KEY);
    }
    if (localStorage.getItem("tw.aiEngineer.panelPinned") === "1") {
      writePinned(true);
      localStorage.removeItem("tw.aiEngineer.panelPinned");
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

type State = {
  pinned: boolean;
  setPinned: (pinned: boolean) => void;
  togglePinned: () => void;
};

export const useWorkspacePanelPinStore = create<State>((set, get) => ({
  pinned: readPinned(),
  setPinned: (pinned) => {
    writePinned(pinned);
    set({ pinned });
  },
  togglePinned: () => {
    get().setPinned(!get().pinned);
  },
}));

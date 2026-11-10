import { create } from "zustand";
import {
  loadEditorPreferences,
  saveEditorPreferences,
  scopeEditorCss,
  type EditorPreferenceStorage,
  type EditorPreferences,
} from "../lib/markdownEditor/preferences";

export interface MarkWiselyPreferencesState {
  preferences: EditorPreferences;
  updatePreferences: (patch: Partial<Omit<EditorPreferences, "version">>) => void;
}

export function createMarkWiselyPreferencesStore(storage: EditorPreferenceStorage) {
  return create<MarkWiselyPreferencesState>((set, get) => ({
    preferences: loadEditorPreferences(storage),
    updatePreferences: (patch) => {
      const preferences: EditorPreferences = { ...get().preferences, ...patch, version: 2 };
      scopeEditorCss(preferences.customCss);
      saveEditorPreferences(storage, preferences);
      set({ preferences });
    },
  }));
}

const browserPreferenceStorage: EditorPreferenceStorage = {
  getItem: (key) => {
    try { return globalThis.localStorage.getItem(key); } catch { return null; }
  },
  setItem: (key, value) => globalThis.localStorage.setItem(key, value),
};

export const useMarkWiselyPreferencesStore = createMarkWiselyPreferencesStore(browserPreferenceStorage);

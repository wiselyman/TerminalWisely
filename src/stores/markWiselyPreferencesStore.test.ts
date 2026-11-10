import { describe, expect, it } from "vitest";
import { createMarkWiselyPreferencesStore } from "./markWiselyPreferencesStore";
import type { EditorPreferenceStorage } from "../lib/markdownEditor/preferences";

function storageWith(initial: Record<string, string> = {}): EditorPreferenceStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("MarkWisely preferences store", () => {
  it("hydrates migrated values and persists focus, typewriter, and theme updates", () => {
    const storage = storageWith({
      "markwisely.editor.preferences": JSON.stringify({ version: 0, theme: "paper", focusMode: true }),
    });
    const store = createMarkWiselyPreferencesStore(storage);
    expect(store.getState().preferences).toMatchObject({ theme: "paper", focusMode: true, typewriterMode: false });

    store.getState().updatePreferences({ theme: "sepia", focusMode: false, typewriterMode: true });
    expect(store.getState().preferences).toMatchObject({ theme: "sepia", focusMode: false, typewriterMode: true });
    expect(JSON.parse(storage.values.get("markwisely.editor.preferences")!)).toMatchObject({ version: 2, theme: "sepia", typewriterMode: true });
  });

  it("does not apply or persist invalid custom CSS", () => {
    const storage = storageWith();
    const store = createMarkWiselyPreferencesStore(storage);
    expect(() => store.getState().updatePreferences({ customCss: "body { color: red; }" })).toThrow();
    expect(store.getState().preferences.customCss).toBe("");
    expect(storage.values.size).toBe(0);
  });
});

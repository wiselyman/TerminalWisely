import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_PREFERENCES,
  loadEditorPreferences,
  saveEditorPreferences,
  scopeEditorCss,
  type EditorPreferenceStorage,
} from "./preferences";

function storageWith(initial: Record<string, string> = {}): EditorPreferenceStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("MarkWisely editor preferences", () => {
  it("loads defaults and migrates the previous preference version", () => {
    const storage = storageWith({
      "markwisely.editor.preferences": JSON.stringify({ version: 0, theme: "sepia", focusMode: true, typewriter: true }),
    });
    expect(loadEditorPreferences(storage)).toEqual({ ...DEFAULT_EDITOR_PREFERENCES, theme: "sepia", focusMode: true, typewriterMode: true });
    expect(loadEditorPreferences(storageWith())).toEqual(DEFAULT_EDITOR_PREFERENCES);
  });

  it("migrates older layouts with the sidebar collapsed and remembers explicit visibility", () => {
    const storage = storageWith({
      "markwisely.editor.preferences": JSON.stringify({ version: 1, theme: "night", focusMode: true, typewriterMode: true, spellcheck: false }),
    });
    expect(loadEditorPreferences(storage)).toMatchObject({ version: 2, theme: "night", focusMode: true, typewriterMode: true, spellcheck: false, sidebarVisible: false });
    saveEditorPreferences(storage, { ...DEFAULT_EDITOR_PREFERENCES, sidebarVisible: true });
    expect(loadEditorPreferences(storage).sidebarVisible).toBe(true);
  });

  it("persists supported preference values and repairs malformed values", () => {
    const storage = storageWith({
      "markwisely.editor.preferences": JSON.stringify({ version: 1, theme: "not-a-theme", focusMode: "yes", typewriterMode: false, customCss: 12 }),
    });
    expect(loadEditorPreferences(storage)).toEqual(DEFAULT_EDITOR_PREFERENCES);
    saveEditorPreferences(storage, { ...DEFAULT_EDITOR_PREFERENCES, focusMode: true });
    expect(JSON.parse(storage.values.get("markwisely.editor.preferences")!)).toMatchObject({ version: 2, focusMode: true });
  });

  it("defaults spellcheck on and persists an explicit toggle", () => {
    expect(DEFAULT_EDITOR_PREFERENCES.spellcheck).toBe(true);
    const storage = storageWith();
    saveEditorPreferences(storage, { ...DEFAULT_EDITOR_PREFERENCES, spellcheck: false });
    expect(loadEditorPreferences(storage).spellcheck).toBe(false);
  });

  it("scopes custom rules to the editor and rejects global or executable CSS", () => {
    expect(scopeEditorCss(".vditor-reset h1, .vditor-reset h2 { color: #243047; }")).toBe(
      ".markwisely-editor-view .vditor-reset h1, .markwisely-editor-view .vditor-reset h2 { color: #243047; }",
    );
    expect(() => scopeEditorCss("body { color: red; }")).toThrow();
    expect(() => scopeEditorCss("@import url(https://example.test/style.css);")).toThrow();
    expect(() => scopeEditorCss(".vditor-reset { background: url(javascript:alert(1)); }")).toThrow();
  });
});

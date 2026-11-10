export const EDITOR_PREFERENCES_KEY = "markwisely.editor.preferences";

export type EditorThemeId = "app" | "paper" | "sepia" | "night";

export interface EditorPreferences {
  version: 2;
  theme: EditorThemeId;
  focusMode: boolean;
  typewriterMode: boolean;
  spellcheck: boolean;
  customCss: string;
  sidebarVisible: boolean;
}

export interface EditorPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const EDITOR_THEME_OPTIONS: ReadonlyArray<{ id: EditorThemeId; labelKey: string }> = [
  { id: "app", labelKey: "markwisely.themeApp" },
  { id: "paper", labelKey: "markwisely.themePaper" },
  { id: "sepia", labelKey: "markwisely.themeSepia" },
  { id: "night", labelKey: "markwisely.themeNight" },
];

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  version: 2,
  theme: "app",
  focusMode: false,
  typewriterMode: false,
  spellcheck: true,
  customCss: "",
  sidebarVisible: false,
};

const themes = new Set<EditorThemeId>(["app", "paper", "sepia", "night"]);

function themeValue(value: unknown): EditorThemeId {
  return typeof value === "string" && themes.has(value as EditorThemeId)
    ? value as EditorThemeId
    : DEFAULT_EDITOR_PREFERENCES.theme;
}

function normalizePreferenceRecord(value: unknown): EditorPreferences {
  if (!value || typeof value !== "object") return { ...DEFAULT_EDITOR_PREFERENCES };
  const record = value as Record<string, unknown>;
  if (record.version !== 0 && record.version !== 1 && record.version !== 2) return { ...DEFAULT_EDITOR_PREFERENCES };
  const migrated = {
    version: 2 as const,
    theme: themeValue(record.theme),
    focusMode: typeof record.focusMode === "boolean" ? record.focusMode : false,
    typewriterMode: typeof record.typewriterMode === "boolean"
      ? record.typewriterMode
      : record.version === 0 && typeof record.typewriter === "boolean" ? record.typewriter : false,
    spellcheck: typeof record.spellcheck === "boolean" ? record.spellcheck : true,
    customCss: typeof record.customCss === "string" ? record.customCss : "",
    sidebarVisible: record.version === 2 && typeof record.sidebarVisible === "boolean"
      ? record.sidebarVisible
      : false,
  };
  try {
    scopeEditorCss(migrated.customCss);
    return migrated;
  } catch {
    return { ...migrated, customCss: "" };
  }
}

export function loadEditorPreferences(storage: EditorPreferenceStorage): EditorPreferences {
  try {
    const serialized = storage.getItem(EDITOR_PREFERENCES_KEY);
    return serialized ? normalizePreferenceRecord(JSON.parse(serialized)) : { ...DEFAULT_EDITOR_PREFERENCES };
  } catch {
    return { ...DEFAULT_EDITOR_PREFERENCES };
  }
}

export function saveEditorPreferences(storage: EditorPreferenceStorage, preferences: EditorPreferences): void {
  const normalized = normalizePreferenceRecord(preferences);
  if (preferences.customCss !== normalized.customCss) {
    throw new Error("Custom editor CSS is invalid or exceeds the allowed limit.");
  }
  storage.setItem(EDITOR_PREFERENCES_KEY, JSON.stringify(normalized));
}

export function scopeEditorCss(css: string): string {
  if (!css.trim()) return "";
  if (css.length > 8000 || /@|url\s*\(|expression\s*\(|javascript\s*:|<\/style/i.test(css)) {
    throw new Error("Custom editor CSS contains unsupported rules.");
  }
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "").trim();
  const rules = Array.from(withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g));
  if (!rules.length || rules.map((rule) => rule[0]).join("").replace(/\s/g, "") !== withoutComments.replace(/\s/g, "")) {
    throw new Error("Custom editor CSS must contain simple selector rules.");
  }
  return rules.map((rule) => {
    const selectors = rule[1].trim().split(",").map((selector) => selector.trim());
    const declarations = rule[2].trim();
    if (!declarations || selectors.some((selector) => !selector || /:root|:global|:host|::slotted|(?:^|[\s>+~,(])(?:html|body)(?:$|[\s>+~.#:[,])/i.test(selector))) {
      throw new Error("Custom editor CSS cannot target global page elements.");
    }
    const scoped = selectors.map((selector) => `.markwisely-editor-view ${selector}`).join(", ");
    return `${scoped} { ${declarations} }`;
  }).join("\n");
}

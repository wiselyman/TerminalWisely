import type { TFunction } from "i18next";

export type SearchKeywordVariant = "package" | "file-content" | "filename";

export interface SearchKeywordPreset {
  id: string;
  label: string;
  value: string;
  hintKey: string;
  groupKey: string;
}

export const PACKAGE_KEYWORD_PRESETS: SearchKeywordPreset[] = [
  { id: "nginx", label: "Nginx", value: "nginx", hintKey: "webServer", groupKey: "webNetwork" },
  { id: "apache", label: "Apache", value: "apache", hintKey: "webServer", groupKey: "webNetwork" },
  { id: "curl", label: "curl", value: "curl", hintKey: "cliHttpTool", groupKey: "webNetwork" },
  { id: "mysql", label: "MySQL", value: "mysql", hintKey: "database", groupKey: "database" },
  { id: "postgres", label: "PostgreSQL", value: "postgres", hintKey: "database", groupKey: "database" },
  { id: "redis", label: "Redis", value: "redis", hintKey: "cacheDatabase", groupKey: "database" },
  { id: "docker", label: "Docker", value: "docker", hintKey: "container", groupKey: "ops" },
  { id: "git", label: "Git", value: "git", hintKey: "versionControl", groupKey: "dev" },
  { id: "python3", label: "Python 3", value: "python3", hintKey: "scriptLanguage", groupKey: "dev" },
  { id: "node", label: "Node.js", value: "node", hintKey: "jsRuntime", groupKey: "dev" },
  { id: "java", label: "Java", value: "java", hintKey: "runtime", groupKey: "dev" },
  { id: "vim", label: "Vim", value: "vim", hintKey: "textEditor", groupKey: "common" },
  { id: "htop", label: "htop", value: "htop", hintKey: "processMonitor", groupKey: "common" },
  { id: "zip", label: "zip / unzip", value: "zip", hintKey: "archiveTool", groupKey: "common" },
];

export const FILE_CONTENT_PRESETS: SearchKeywordPreset[] = [
  { id: "error", label: "", value: "error", hintKey: "", groupKey: "logTriage" },
  { id: "warn", label: "", value: "warn", hintKey: "", groupKey: "logTriage" },
  { id: "refused", label: "", value: "refused", hintKey: "", groupKey: "logTriage" },
  { id: "timeout", label: "", value: "timeout", hintKey: "", groupKey: "logTriage" },
  { id: "permission", label: "", value: "Permission denied", hintKey: "", groupKey: "logTriage" },
  { id: "todo", label: "", value: "TODO", hintKey: "", groupKey: "codeSearch" },
  { id: "password", label: "", value: "password", hintKey: "", groupKey: "codeSearch" },
  { id: "localhost", label: "", value: "127.0.0.1", hintKey: "", groupKey: "codeSearch" },
];

export const FILENAME_PRESETS: SearchKeywordPreset[] = [
  { id: "nginxConf", label: "", value: "nginx.conf", hintKey: "", groupKey: "configFiles" },
  { id: "config", label: "", value: "config", hintKey: "", groupKey: "configFiles" },
  { id: "log", label: "", value: ".log", hintKey: "", groupKey: "configFiles" },
  { id: "env", label: "", value: ".env", hintKey: "", groupKey: "configFiles" },
  { id: "service", label: "", value: ".service", hintKey: "", groupKey: "systemFiles" },
  { id: "sh", label: "", value: ".sh", hintKey: "", groupKey: "systemFiles" },
];

/** Presets in file-content/filename variants localize label+hint via `keywords.presets.<id>`. */
export function presetLabel(t: TFunction, preset: SearchKeywordPreset): string {
  if (preset.label) return preset.label;
  return t(`commands:keywords.presets.${preset.id}.label`);
}

export function presetHint(t: TFunction, preset: SearchKeywordPreset): string {
  if (preset.hintKey) return t(`commands:keywords.hint.${preset.hintKey}`);
  return t(`commands:keywords.presets.${preset.id}.hint`);
}

export function presetGroupLabel(t: TFunction, groupKey: string): string {
  return t(`commands:keywords.group.${groupKey}`);
}

export function presetsForVariant(variant: SearchKeywordVariant): SearchKeywordPreset[] {
  switch (variant) {
    case "package":
      return PACKAGE_KEYWORD_PRESETS;
    case "file-content":
      return FILE_CONTENT_PRESETS;
    case "filename":
      return FILENAME_PRESETS;
  }
}

export function findPreset(
  variant: SearchKeywordVariant,
  value: string,
): SearchKeywordPreset | undefined {
  return presetsForVariant(variant).find((preset) => preset.value === value.trim());
}

export function groupPresets(
  presets: SearchKeywordPreset[],
): { groupKey: string; items: SearchKeywordPreset[] }[] {
  const groups = new Map<string, SearchKeywordPreset[]>();
  for (const preset of presets) {
    const list = groups.get(preset.groupKey) ?? [];
    list.push(preset);
    groups.set(preset.groupKey, list);
  }
  return [...groups.entries()].map(([groupKey, items]) => ({ groupKey, items }));
}

export function describeSearchKeyword(
  t: TFunction,
  variant: SearchKeywordVariant,
  value: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    switch (variant) {
      case "package":
        return t("commands:keywords.emptyPackage");
      case "file-content":
        return t("commands:keywords.emptyFileContent");
      case "filename":
        return t("commands:keywords.emptyFilename");
    }
  }
  const preset = findPreset(variant, trimmed);
  if (preset) {
    return t("commands:keywords.matchedPreset", {
      label: presetLabel(t, preset),
      hint: presetHint(t, preset),
    });
  }
  switch (variant) {
    case "package":
      return t("commands:keywords.willSearchPackage", { value: trimmed });
    case "file-content":
      return t("commands:keywords.willSearchFileContent", { value: trimmed });
    case "filename":
      return t("commands:keywords.willSearchFilename", { value: trimmed });
  }
}

export function variantSectionTitle(t: TFunction, variant: SearchKeywordVariant): string {
  switch (variant) {
    case "package":
      return t("commands:keywords.sectionPackage");
    case "file-content":
      return t("commands:keywords.sectionFileContent");
    case "filename":
      return t("commands:keywords.sectionFilename");
  }
}

export function variantCustomLabel(t: TFunction, variant: SearchKeywordVariant): string {
  switch (variant) {
    case "package":
      return t("commands:keywords.customPackage");
    case "file-content":
      return t("commands:keywords.customFileContent");
    case "filename":
      return t("commands:keywords.customFilename");
  }
}

export function variantPlaceholder(t: TFunction, variant: SearchKeywordVariant): string {
  switch (variant) {
    case "package":
      return t("commands:keywords.placeholderPackage");
    case "file-content":
      return t("commands:keywords.placeholderFileContent");
    case "filename":
      return t("commands:keywords.placeholderFilename");
  }
}

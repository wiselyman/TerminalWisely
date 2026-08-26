import type { TFunction } from "i18next";

export interface CommonPortPreset {
  id: string;
  port: string;
  label: string;
  hintKey: string;
  groupKey: string;
}

export const COMMON_PORT_PRESETS: CommonPortPreset[] = [
  { id: "22", port: "22", label: "SSH", hintKey: "sshLogin", groupKey: "common" },
  { id: "80", port: "80", label: "HTTP", hintKey: "httpPort", groupKey: "common" },
  { id: "443", port: "443", label: "HTTPS", hintKey: "httpsPort", groupKey: "common" },
  { id: "3306", port: "3306", label: "MySQL", hintKey: "database", groupKey: "database" },
  { id: "5432", port: "5432", label: "PostgreSQL", hintKey: "database", groupKey: "database" },
  { id: "6379", port: "6379", label: "Redis", hintKey: "cache", groupKey: "database" },
  { id: "8080", port: "8080", label: "8080", hintKey: "commonApp", groupKey: "app" },
  { id: "9000", port: "9000", label: "9000", hintKey: "commonApp", groupKey: "app" },
];

export function isValidPort(value: string): boolean {
  const n = Number(value.trim());
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

export function groupPortPresets(): { groupKey: string; items: CommonPortPreset[] }[] {
  const groups = new Map<string, CommonPortPreset[]>();
  for (const preset of COMMON_PORT_PRESETS) {
    const list = groups.get(preset.groupKey) ?? [];
    list.push(preset);
    groups.set(preset.groupKey, list);
  }
  return [...groups.entries()].map(([groupKey, items]) => ({ groupKey, items }));
}

export function describePort(
  t: TFunction,
  value: string,
  optional = false,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return optional
      ? t("commands:ports.emptyOptional")
      : t("commands:ports.emptyRequired");
  }
  if (!isValidPort(trimmed)) return t("commands:ports.invalid");
  const preset = COMMON_PORT_PRESETS.find((item) => item.port === trimmed);
  if (preset) {
    return t("commands:ports.described", {
      port: trimmed,
      label: preset.label,
      hint: t(`commands:ports.hint.${preset.hintKey}`),
    });
  }
  return t("commands:ports.describedPlain", { port: trimmed });
}

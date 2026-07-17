import type { TFunction } from "i18next";

export interface ChmodBits {
  owner: { r: boolean; w: boolean; x: boolean };
  group: { r: boolean; w: boolean; x: boolean };
  other: { r: boolean; w: boolean; x: boolean };
}

export interface ChmodPreset {
  id: string;
  mode: string;
}

export const CHMOD_PRESETS: ChmodPreset[] = [
  { id: "file", mode: "644" },
  { id: "script", mode: "755" },
  { id: "private-file", mode: "600" },
  { id: "private-dir", mode: "700" },
  { id: "shared", mode: "664" },
  { id: "public-dir", mode: "775" },
];

export function chmodPresetLabel(t: TFunction, preset: ChmodPreset): string {
  return t(`commands:chmod.presets.${preset.id}.label`);
}

export function chmodPresetHint(t: TFunction, preset: ChmodPreset): string {
  return t(`commands:chmod.presets.${preset.id}.hint`);
}

const TRIPLET = /^[0-7]{3}$/;

function digitToBits(d: number): { r: boolean; w: boolean; x: boolean } {
  return {
    r: (d & 4) !== 0,
    w: (d & 2) !== 0,
    x: (d & 1) !== 0,
  };
}

function bitsToDigit(bits: { r: boolean; w: boolean; x: boolean }): number {
  return (bits.r ? 4 : 0) + (bits.w ? 2 : 0) + (bits.x ? 1 : 0);
}

export function isValidChmodMode(value: string): boolean {
  return TRIPLET.test(value.trim());
}

export function octalToBits(octal: string): ChmodBits | null {
  const trimmed = octal.trim();
  if (!TRIPLET.test(trimmed)) return null;
  const [o, g, t] = trimmed.split("").map((ch) => Number(ch));
  return {
    owner: digitToBits(o),
    group: digitToBits(g),
    other: digitToBits(t),
  };
}

export function bitsToOctal(bits: ChmodBits): string {
  return `${bitsToDigit(bits.owner)}${bitsToDigit(bits.group)}${bitsToDigit(bits.other)}`;
}

function describeTriplet(
  t: TFunction,
  bits: { r: boolean; w: boolean; x: boolean },
): string {
  const parts: string[] = [];
  if (bits.r) parts.push(t("commands:chmod.read"));
  if (bits.w) parts.push(t("commands:chmod.write"));
  if (bits.x) parts.push(t("commands:chmod.execute"));
  return parts.length > 0
    ? parts.join(t("commands:chmod.listSeparator"))
    : t("commands:chmod.noPermission");
}

export function describeChmodMode(t: TFunction, mode: string): string {
  const bits = octalToBits(mode);
  if (!bits) return t("commands:chmod.chooseHint");
  return t("commands:chmod.summary", {
    owner: describeTriplet(t, bits.owner),
    group: describeTriplet(t, bits.group),
    other: describeTriplet(t, bits.other),
  });
}

export function findPresetByMode(mode: string): ChmodPreset | undefined {
  return CHMOD_PRESETS.find((preset) => preset.mode === mode.trim());
}

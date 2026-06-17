import type { SimpleIcon } from "simple-icons";
import {
  siAlmalinux,
  siAlpinelinux,
  siApple,
  siArchlinux,
  siCentos,
  siDebian,
  siFedora,
  siFreebsd,
  siLinux,
  siOpensuse,
  siRedhat,
  siRockylinux,
  siUbuntu,
} from "simple-icons/icons";

/** Windows logo (four equal panes, 24×24 viewBox — matches Fluent brand layout). */
const siWindows = {
  title: "Windows",
  slug: "windows",
  hex: "0078D4",
  path: "M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z",
} as SimpleIcon;

const OS_LOGOS: Record<string, SimpleIcon> = {
  ubuntu: siUbuntu,
  debian: siDebian,
  centos: siCentos,
  rhel: siRedhat,
  rocky: siRockylinux,
  alma: siAlmalinux,
  fedora: siFedora,
  alpine: siAlpinelinux,
  arch: siArchlinux,
  opensuse: siOpensuse,
  "opensuse-leap": siOpensuse,
  "opensuse-tumbleweed": siOpensuse,
  sles: siOpensuse,
  amazon: siLinux,
  openeuler: siLinux,
  macos: siApple,
  darwin: siApple,
  windows: siWindows,
  freebsd: siFreebsd,
  linux: siLinux,
};

export function logoForOsId(osId: string): SimpleIcon | null {
  return OS_LOGOS[osId.trim().toLowerCase()] ?? null;
}

/** Brand hex on dark UI — lift near-black logos (e.g. Apple) so they stay visible. */
export function iconFillForDarkUi(hex: string): string {
  const raw = hex.replace("#", "").trim();
  if (raw.length !== 6) {
    return `#${raw}`;
  }
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  // Relative luminance (sRGB), 0 = black.
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (luminance < 0.22) {
    return "#e6edf3";
  }
  return `#${raw.toLowerCase()}`;
}

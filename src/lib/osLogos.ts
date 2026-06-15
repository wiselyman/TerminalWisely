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

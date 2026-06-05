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
  siMacos,
  siOpensuse,
  siRedhat,
  siRockylinux,
  siUbuntu,
} from "simple-icons/icons";

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
  macos: siMacos,
  darwin: siApple,
  freebsd: siFreebsd,
  linux: siLinux,
};

export function logoForOsId(osId: string): SimpleIcon | null {
  return OS_LOGOS[osId.trim().toLowerCase()] ?? null;
}

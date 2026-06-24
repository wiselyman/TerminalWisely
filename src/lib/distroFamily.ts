import type { DistroFamily } from "../types";

export const DISTRO_FAMILY_LABELS: Record<DistroFamily, string> = {
  universal: "通用",
  debian: "Debian 系",
  rhel: "RHEL 系",
  alpine: "Alpine",
  arch: "Arch",
  suse: "SUSE",
};

export const SUBCATEGORY_LABELS: Record<string, string> = {
  all: "全部",
  service: "服务",
  journal: "日志",
  disk: "磁盘",
  process: "进程",
  network: "网络",
  package: "软件包",
  file: "文件",
  user: "用户",
  cron: "计划任务",
  kernel: "系统信息",
  custom: "自定义",
};

export function osIdToDistroFamily(
  osId: string | null | undefined,
): DistroFamily | "unknown" {
  const id = osId?.trim().toLowerCase() ?? "";
  if (!id || id === "linux") return "unknown";
  if (
    id.includes("ubuntu") ||
    id.includes("debian") ||
    id === "linuxmint" ||
    id === "kali"
  ) {
    return "debian";
  }
  if (
    id.includes("centos") ||
    id.includes("rhel") ||
    id === "rocky" ||
    id === "alma" ||
    id === "amazon" ||
    id === "fedora" ||
    id.includes("amzn") ||
    id.includes("openeuler")
  ) {
    return "rhel";
  }
  if (id.includes("alpine")) return "alpine";
  if (id.includes("arch") || id === "manjaro") return "arch";
  if (id.includes("suse") || id === "sles") return "suse";
  return "unknown";
}

export function commandMatchesDistro(
  families: DistroFamily[],
  osId: string | null | undefined,
): boolean {
  if (families.includes("universal")) return true;
  const family = osIdToDistroFamily(osId);
  if (family === "unknown") return true;
  return families.includes(family);
}

export function distroFilterHint(osId: string | null | undefined): string | null {
  const family = osIdToDistroFamily(osId);
  if (family === "unknown") return null;
  return `已按 ${DISTRO_FAMILY_LABELS[family]} 筛选`;
}

export function primaryDistroLabel(
  families: DistroFamily[],
): string | null {
  const tagged = families.filter((f) => f !== "universal");
  if (tagged.length === 0) return null;
  return DISTRO_FAMILY_LABELS[tagged[0]];
}

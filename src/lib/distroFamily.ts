import type { DistroFamily } from "../types";

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

export function distroFilterFamily(
  osId: string | null | undefined,
): DistroFamily | null {
  const family = osIdToDistroFamily(osId);
  if (family === "unknown") return null;
  return family;
}

export function primaryDistroFamily(
  families: DistroFamily[],
): DistroFamily | null {
  const tagged = families.filter((f) => f !== "universal");
  if (tagged.length === 0) return null;
  return tagged[0];
}

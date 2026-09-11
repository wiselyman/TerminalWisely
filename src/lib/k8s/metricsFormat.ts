/** Parse kubectl-style CPU strings to millicores. */
export function parseCpuToMilli(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.endsWith("m")) {
    const n = Number(s.slice(0, -1));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) : null;
}

/** Parse kubectl-style memory strings to KiB. */
export function parseMemoryToKi(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.endsWith("Ki")) {
    const n = Number(s.slice(0, -2));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  if (s.endsWith("Mi")) {
    const n = Number(s.slice(0, -2));
    return Number.isFinite(n) && n >= 0 ? n * 1024 : null;
  }
  if (s.endsWith("Gi")) {
    const n = Number(s.slice(0, -2));
    return Number.isFinite(n) && n >= 0 ? n * 1024 * 1024 : null;
  }
  const bytes = Number(s);
  if (Number.isFinite(bytes) && bytes >= 0) {
    return bytes / 1024;
  }
  return null;
}

/** Usage ratio clamped to [0, 1]. Returns null when capacity is zero or invalid. */
export function usageRatio(used: number, capacity: number): number | null {
  if (!Number.isFinite(used) || !Number.isFinite(capacity) || capacity <= 0) {
    return null;
  }
  return Math.min(Math.max(used / capacity, 0), 1);
}

export function parseStorageToKi(raw: string): number | null {
  return parseMemoryToKi(raw);
}

export type ResourceBarKind = "cpu" | "memory" | "disk";

export function resourceToUnits(kind: ResourceBarKind, raw: string): number | null {
  if (kind === "cpu") return parseCpuToMilli(raw);
  return parseMemoryToKi(raw);
}

export function formatUsagePercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

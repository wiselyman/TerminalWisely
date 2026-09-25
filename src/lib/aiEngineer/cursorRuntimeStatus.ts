import type { RuntimeProbeResult } from "./api";

export type CursorRuntimeStatusKind =
  | "ready"
  | "ready_fake"
  | "not_ready"
  | "unknown";

/** Map probe payload → coarse UI status (no i18n). */
export function cursorRuntimeStatusKind(
  probe: RuntimeProbeResult | null | undefined,
): CursorRuntimeStatusKind {
  if (!probe || probe.kind !== "cursor") return "unknown";
  if (probe.installed && probe.authenticated) {
    return probe.fake ? "ready_fake" : "ready";
  }
  return "not_ready";
}

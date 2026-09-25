import type { AgentRuntimeKind, RuntimeProbeResult } from "./api";

export type ExternalRuntimeStatusKind =
  | "ready"
  | "ready_fake"
  | "install_needed"
  | "not_ready"
  | "unknown";

/** Map probe payload → coarse UI status (no i18n). */
export function externalRuntimeStatusKind(
  probe: RuntimeProbeResult | null | undefined,
  expectedKind?: AgentRuntimeKind | string,
): ExternalRuntimeStatusKind {
  if (!probe) return "unknown";
  if (expectedKind && probe.kind !== expectedKind) return "unknown";
  if (probe.code === "install_needed" || (!probe.installed && !probe.fake)) {
    return "install_needed";
  }
  if (probe.installed && (probe.authenticated || probe.fake)) {
    return probe.fake ? "ready_fake" : "ready";
  }
  return "not_ready";
}

/** @deprecated use externalRuntimeStatusKind */
export function cursorRuntimeStatusKind(
  probe: RuntimeProbeResult | null | undefined,
): ExternalRuntimeStatusKind {
  return externalRuntimeStatusKind(probe, "cursor");
}

export type CursorRuntimeStatusKind = ExternalRuntimeStatusKind;

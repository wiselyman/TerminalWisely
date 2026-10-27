/** The machine whose desktop applications and state are currently in use. */
export type DesktopTarget =
  | { kind: "local" }
  | { kind: "ssh"; sessionId: string };

export function desktopTargetKey(target: DesktopTarget): string {
  return target.kind === "local" ? "local" : `ssh:${target.sessionId}`;
}

export function isSshDesktopTarget(
  target: DesktopTarget | null | undefined,
): target is { kind: "ssh"; sessionId: string } {
  return target?.kind === "ssh" && target.sessionId.length > 0;
}

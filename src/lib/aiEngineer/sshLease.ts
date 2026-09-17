export function isAiSshLeased(
  leasedSessionIds: ReadonlySet<string>,
  sessionId: string,
): boolean {
  return Boolean(sessionId) && leasedSessionIds.has(sessionId);
}

export function shouldAutoReconnectSsh(opts: {
  kind: string;
  isDisconnected: boolean;
  leased: boolean;
}): boolean {
  if (opts.leased) return false;
  return opts.kind === "ssh" && opts.isDisconnected;
}

export function shouldAllowManualReconnectSsh(leased: boolean): boolean {
  return !leased;
}

/** Derive remote_user from server_id (`user@host:port`). */
export function remoteUserFromServerId(serverId?: string | null): string | null {
  const raw = (serverId || "").trim();
  if (!raw) return null;
  const at = raw.indexOf("@");
  if (at <= 0) return null;
  const user = raw.slice(0, at).trim();
  return user || null;
}

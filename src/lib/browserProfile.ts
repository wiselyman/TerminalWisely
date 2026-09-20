/** Host identity for history/bookmarks: `user@host:port`. */
export function browserProfileKey(
  username: string,
  host: string,
  port: number,
): string {
  const user = username.trim() || "user";
  const h = host.trim() || "host";
  const p = Number.isFinite(port) && port > 0 ? port : 22;
  return `${user}@${h}:${p}`;
}

/**
 * Per-SSH-tab profile (cookies + WK data store). Must include `sessionId` so
 * two tabs to the same user@host never share a webview or tunnel.
 */
export function browserSessionProfileKey(
  username: string,
  host: string,
  port: number,
  sessionId: string,
): string {
  const base = browserProfileKey(username, host, port);
  const sid = sessionId.trim() || "session";
  return `${base}#${sid}`;
}

/** Sanitize for Tauri webview labels / path segments. */
export function browserProfileLabelSlug(profileKey: string): string {
  return (
    profileKey
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "host"
  );
}

export function browserWebviewLabel(profileKey: string): string {
  return `host-browser-${browserProfileLabelSlug(profileKey)}`;
}

/** Prefer session-scoped labels so host-tab switch cannot collide. */
export function browserSessionWebviewLabel(sessionId: string): string {
  const slug = browserProfileLabelSlug(sessionId.trim() || "session");
  return `host-browser-${slug}`;
}

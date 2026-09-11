/** Helpers for Hosts-list → SSH kubectl bind UX. */

export type SshTabLike = {
  id: string;
  server_id?: string | null;
  title?: string;
};

export type ProbeLike = { ok: boolean } | "loading" | undefined;

export type ClusterLike = {
  id: string;
  kind: string;
  server_id?: string | null;
  session_id?: string | null;
};

export type SavedConnectionLike = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_method: string;
  has_password: boolean;
};

/** Match key used when binding Hosts → K8s (`user@host:port`). */
export function savedServerKey(saved: {
  username: string;
  host: string;
  port: number;
}): string {
  return `${saved.username}@${saved.host}:${saved.port}`;
}

export function findSavedConnectionForServer<T extends SavedConnectionLike>(
  savedConnections: readonly T[],
  serverId: string | null | undefined,
): T | null {
  if (!serverId) return null;
  return (
    savedConnections.find((saved) => savedServerKey(saved) === serverId) ?? null
  );
}

function titleMatchesSavedName(title: string | undefined, savedName: string): boolean {
  if (!title) return false;
  const base = savedName.trim();
  if (!base) return false;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}(?: \\(\\d+\\))?$`).test(title);
}

function titleIndex(title: string | undefined, savedName: string): number {
  if (!title) return Number.POSITIVE_INFINITY;
  const base = savedName.trim();
  if (!base) return Number.POSITIVE_INFINITY;
  // Bare title is the primary tab (index 0); numbered tabs start at 1.
  if (title === base) return 0;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = title.match(new RegExp(`^${escaped} \\((\\d+)\\)$`));
  if (!match) return Number.POSITIVE_INFINITY;
  return Number.parseInt(match[1], 10);
}

/**
 * Prefer active SSH tab for this server, else the bare / lowest-numbered tab
 * (e.g. `spark-remote` over `spark-remote (1)`), else first match.
 * Also matches by tab title when `server_id` is not set yet (connecting).
 */
export function findSshTabForSaved(
  sshTabs: SshTabLike[],
  serverKey: string,
  activeTabId: string | null,
  savedName?: string,
): SshTabLike | null {
  const matches = sshTabs.filter((tab) => {
    if (tab.server_id === serverKey) return true;
    return Boolean(savedName && titleMatchesSavedName(tab.title, savedName));
  });
  if (matches.length === 0) return null;
  if (activeTabId) {
    const active = matches.find((tab) => tab.id === activeTabId);
    if (active) return active;
  }
  if (savedName) {
    const ranked = [...matches].sort(
      (a, b) => titleIndex(a.title, savedName) - titleIndex(b.title, savedName),
    );
    return ranked[0] ?? null;
  }
  return matches[0] ?? null;
}

export function sshKubectlProbeOk(probe: ProbeLike): boolean {
  return probe != null && probe !== "loading" && probe.ok === true;
}

export function findSshKubectlClusterForServer(
  clusters: ClusterLike[],
  serverId: string | null | undefined,
): ClusterLike | null {
  if (!serverId) return null;
  return (
    clusters.find(
      (c) => c.kind === "ssh_kubectl" && c.server_id === serverId,
    ) ?? null
  );
}

/**
 * Live SSH tab session for an ssh_kubectl cluster.
 * Does **not** fall back to a stale binding `session_id` when no tab is open.
 */
export function liveJumpHostSessionId(
  cluster: ClusterLike,
  sshTabs: SshTabLike[],
  activeTabId: string | null,
): string | null {
  if (cluster.kind !== "ssh_kubectl") return null;
  if (cluster.server_id) {
    return findSshTabForSaved(sshTabs, cluster.server_id, activeTabId)?.id ?? null;
  }
  return null;
}

export function resolveLiveSessionForCluster(
  cluster: ClusterLike,
  sshTabs: SshTabLike[],
  activeTabId: string | null,
): string | null {
  const live = liveJumpHostSessionId(cluster, sshTabs, activeTabId);
  if (live) return live;
  return cluster.session_id ?? null;
}

export function jumpHostNeedsAuth(
  saved: SavedConnectionLike | null,
): boolean {
  if (!saved) return false;
  return saved.auth_method === "password" && !saved.has_password;
}

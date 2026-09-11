/** Shared management entity refs for Hosts (servers) and Kubernetes (clusters). */

export type ManagedKind = "server" | "cluster";

export interface ManagedEntityRef {
  kind: ManagedKind;
  id: string;
  label: string;
  /** SSH session id when kind=server and a live tab exists. */
  sessionId?: string | null;
  /** Stable server identity `user@host:port` when kind=server. */
  serverId?: string | null;
}

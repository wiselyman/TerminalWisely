/**
 * Keep open cluster tab ids aligned with the current cluster list, and ensure
 * the focused/selected cluster always has a top-bar tab (Lens/Headlamp-style).
 */
export function syncOpenClusterTabIds(
  openClusterIds: string[],
  validClusterIds: Iterable<string>,
  selectedClusterId: string | null | undefined,
): string[] {
  const valid = new Set(validClusterIds);
  const next = openClusterIds.filter((id) => valid.has(id));
  if (
    selectedClusterId &&
    valid.has(selectedClusterId) &&
    !next.includes(selectedClusterId)
  ) {
    next.push(selectedClusterId);
  }
  return next;
}

type ClusterPick = { id: string; display_name: string };

/** Resolve which cluster is active — never auto-picks the first list entry. */
export function resolveSelectedCluster<T extends ClusterPick>(
  clusters: T[],
  selectedClusterId: string | null,
  preferDisplayName?: string | null,
): T | null {
  const prefer = preferDisplayName?.trim();
  if (prefer) {
    const matched = clusters.find(
      (c) =>
        c.display_name === prefer || c.display_name.startsWith(`${prefer}/`),
    );
    if (matched) return matched;
  }
  if (selectedClusterId) {
    return clusters.find((c) => c.id === selectedClusterId) ?? null;
  }
  return null;
}

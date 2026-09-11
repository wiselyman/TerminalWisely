/** Lens-style day-2 action eligibility helpers. */

/**
 * Higher-level controllers first.
 * Pod ownerRefs usually only list the immediate owner (ReplicaSet / Job);
 * Deployment / CronJob are resolved via the immediate owner's ownerRefs.
 */
const CONTROLLER_OWNER_PREFERENCE = [
  "Deployment",
  "StatefulSet",
  "DaemonSet",
  "CronJob",
  "Job",
  "ReplicaSet",
  "ReplicationController",
] as const;

/** Immediate owners that often sit under a higher-level controller. */
const RESOLVE_PARENT_KINDS = new Set(["ReplicaSet", "Job"]);

export type K8sControllerOwner = { kind: string; name: string };

export function canScale(kind: string): boolean {
  return kind === "Deployment" || kind === "StatefulSet" || kind === "ReplicaSet";
}

export function canRestart(kind: string): boolean {
  return kind === "Deployment" || kind === "StatefulSet" || kind === "DaemonSet";
}

export function canPortForward(kind: string): boolean {
  const k = kind.trim().toLowerCase();
  return k === "pod" || k === "service" || k === "svc";
}

export function canLogs(kind: string): boolean {
  return (
    kind === "Pod" ||
    kind === "Deployment" ||
    kind === "StatefulSet" ||
    kind === "DaemonSet" ||
    kind === "Job"
  );
}

export function canShell(kind: string): boolean {
  return kind === "Pod";
}

export function canNodeShell(kind: string): boolean {
  return kind === "Node";
}

export function ownerNeedsParentResolve(kind: string): boolean {
  return RESOLVE_PARENT_KINDS.has(kind);
}

/** Prefer a workload controller from overview `ownerRefs` like `StatefulSet/foo, ReplicaSet/bar`. */
export function parseControllerOwner(
  ownerRefs?: string | null,
): K8sControllerOwner | null {
  if (!ownerRefs?.trim()) return null;
  const parsed: K8sControllerOwner[] = [];
  for (const part of ownerRefs.split(",")) {
    const token = part.trim();
    if (!token) continue;
    const slash = token.indexOf("/");
    if (slash <= 0 || slash === token.length - 1) continue;
    const kind = token.slice(0, slash).trim();
    const name = token.slice(slash + 1).trim();
    if (!kind || !name) continue;
    parsed.push({ kind, name });
  }
  for (const kind of CONTROLLER_OWNER_PREFERENCE) {
    const found = parsed.find((o) => o.kind === kind);
    if (found) return found;
  }
  // Any other ownerReference (custom controllers, Rollout, etc.)
  return parsed[0] ?? null;
}

/**
 * If the immediate owner is ReplicaSet/Job, lift to Deployment/CronJob when
 * those appear in the parent's ownerRefs.
 */
export function preferWorkloadOwner(
  immediate: K8sControllerOwner | null,
  parentOwnerRefs?: string | null,
): K8sControllerOwner | null {
  if (!immediate) return null;
  if (!ownerNeedsParentResolve(immediate.kind)) return immediate;
  const parent = parseControllerOwner(parentOwnerRefs);
  if (immediate.kind === "ReplicaSet" && parent?.kind === "Deployment") {
    return parent;
  }
  if (immediate.kind === "Job" && parent?.kind === "CronJob") {
    return parent;
  }
  return immediate;
}

/** When deleting a Pod managed by a controller, surface the owner as the better delete target. */
export function ownedPodDeleteController(
  resourceKind: string,
  ownerRefs?: string | null,
): K8sControllerOwner | null {
  if (resourceKind !== "Pod") return null;
  return parseControllerOwner(ownerRefs);
}

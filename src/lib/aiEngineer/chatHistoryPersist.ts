/**
 * Chat history localStorage hygiene: prune orphans, retry on quota.
 * Keeps recent host threads from being silently dropped when storage is full.
 */

export type PersistableThread = {
  id: string;
  title?: string;
  updatedAt?: number;
  messages?: unknown[];
};

export type PersistableBundle = {
  activeThreadId: string;
  threads: PersistableThread[];
};

export type PersistableByScope = Record<string, PersistableBundle>;

/** Empty connecting-tab scopes that never received real chat. */
export function isOrphanPendingScope(scope: string, bundle: PersistableBundle): boolean {
  if (!scope.includes("pending:")) return false;
  const threads = bundle.threads ?? [];
  if (threads.length === 0) return true;
  return threads.every((t) => !Array.isArray(t.messages) || t.messages.length === 0);
}

function threadHasMessages(t: PersistableThread): boolean {
  return Array.isArray(t.messages) && t.messages.length > 0;
}

/**
 * Drop empty "New chat" placeholders when real threads exist, and never keep an
 * empty thread as active if another thread has messages (hydrate race fix).
 */
export function sanitizeScopeBundle(bundle: PersistableBundle): PersistableBundle {
  const threads = Array.isArray(bundle.threads) ? bundle.threads : [];
  if (threads.length === 0) {
    return { activeThreadId: bundle.activeThreadId, threads };
  }
  const withMsgs = threads.filter(threadHasMessages);
  const kept = withMsgs.length > 0 ? withMsgs : threads;
  const activeOk = kept.find((t) => t.id === bundle.activeThreadId);
  if (activeOk && (withMsgs.length === 0 || threadHasMessages(activeOk))) {
    return { activeThreadId: activeOk.id, threads: kept };
  }
  const newest = [...kept].sort(
    (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
  )[0];
  return {
    activeThreadId: newest?.id ?? bundle.activeThreadId,
    threads: kept,
  };
}

export function sanitizeByScope(byScope: PersistableByScope): PersistableByScope {
  const out: PersistableByScope = {};
  for (const [scope, bundle] of Object.entries(byScope)) {
    out[scope] = sanitizeScopeBundle(bundle);
  }
  return out;
}

/** Drop empty pending:/session:pending: buckets that bloat localStorage. */
export function pruneOrphanPendingScopes(
  byScope: PersistableByScope,
): PersistableByScope {
  const out: PersistableByScope = {};
  for (const [scope, bundle] of Object.entries(byScope)) {
    if (isOrphanPendingScope(scope, bundle)) continue;
    out[scope] = sanitizeScopeBundle(bundle);
  }
  return out;
}

/**
 * If still over budget, drop oldest empty-ish scopes first, then oldest
 * non-active scopes with the least recent activity.
 */
export function pruneForQuota(
  byScope: PersistableByScope,
  keepScopes: string[] = [],
  maxScopes = 40,
): PersistableByScope {
  let next = pruneOrphanPendingScopes(byScope);
  const keep = new Set(keepScopes.filter(Boolean));
  if (Object.keys(next).length <= maxScopes) return next;

  const ranked = Object.entries(next).map(([scope, bundle]) => {
    const updated = Math.max(
      0,
      ...(bundle.threads ?? []).map((t) =>
        typeof t.updatedAt === "number" ? t.updatedAt : 0,
      ),
    );
    const msgCount = (bundle.threads ?? []).reduce(
      (n, t) => n + (Array.isArray(t.messages) ? t.messages.length : 0),
      0,
    );
    return { scope, updated, msgCount };
  });
  // Lowest priority first (dropped); keepScopes and recent content last.
  ranked.sort((a, b) => {
    const aKeep = keep.has(a.scope) ? 1 : 0;
    const bKeep = keep.has(b.scope) ? 1 : 0;
    if (aKeep !== bKeep) return aKeep - bKeep;
    if (a.msgCount === 0 && b.msgCount > 0) return -1;
    if (b.msgCount === 0 && a.msgCount > 0) return 1;
    return a.updated - b.updated;
  });

  const drop = new Set(
    ranked.slice(0, Math.max(0, ranked.length - maxScopes)).map((r) => r.scope),
  );
  const out: PersistableByScope = {};
  for (const [scope, bundle] of Object.entries(next)) {
    if (drop.has(scope) && !keep.has(scope)) continue;
    out[scope] = bundle;
  }
  return out;
}

export function isQuotaExceededError(err: unknown): boolean {
  const msg = String(err ?? "");
  return (
    msg.includes("QuotaExceeded") ||
    msg.includes("QUOTA_EXCEEDED") ||
    msg.includes("NS_ERROR_DOM_QUOTA_REACHED")
  );
}

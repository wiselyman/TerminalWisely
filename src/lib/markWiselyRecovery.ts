const DRAFTS_KEY = "terminal-wisely.markwisely-drafts.v1";

export interface MarkWiselyDraft {
  text: string;
  updatedAt: number;
}

type DraftsByScope = Record<string, Record<string, MarkWiselyDraft>>;

function readAllDrafts(storage: Storage): DraftsByScope {
  try {
    const value: unknown = JSON.parse(storage.getItem(DRAFTS_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as DraftsByScope;
  } catch {
    return {};
  }
}

export function readMarkWiselyDraft(
  storage: Storage,
  scope: string,
  path: string,
): MarkWiselyDraft | null {
  const draft = readAllDrafts(storage)[scope]?.[path];
  return draft && typeof draft.text === "string" && typeof draft.updatedAt === "number"
    ? draft
    : null;
}

export function saveMarkWiselyDraft(
  storage: Storage,
  scope: string,
  path: string,
  text: string,
  updatedAt = Date.now(),
): boolean {
  try {
    const drafts = readAllDrafts(storage);
    storage.setItem(DRAFTS_KEY, JSON.stringify({
      ...drafts,
      [scope]: { ...drafts[scope], [path]: { text, updatedAt } },
    }));
    return true;
  } catch {
    return false;
  }
}

export function removeMarkWiselyDraft(storage: Storage, scope: string, path: string): void {
  try {
    const drafts = readAllDrafts(storage);
    const scoped = { ...(drafts[scope] ?? {}) };
    delete scoped[path];
    if (Object.keys(scoped).length) drafts[scope] = scoped;
    else delete drafts[scope];
    if (Object.keys(drafts).length) storage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    else storage.removeItem(DRAFTS_KEY);
  } catch {
    // A stale recovery record must not prevent document editing or saving.
  }
}

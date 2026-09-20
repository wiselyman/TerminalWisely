/** Rank visit history for address-bar autocomplete. */

export interface BrowserHistoryEntry {
  url: string;
  title: string;
  profile_key: string;
  visited_at: number;
}

export interface BrowserBookmark {
  id: string;
  url: string;
  title: string;
  profile_key: string;
  created_at: number;
}

/** Score a history entry against a typed query (higher = better). */
export function scoreHistoryMatch(
  query: string,
  entry: BrowserHistoryEntry,
  activeProfileKey: string | null,
): number {
  const q = query.trim().toLowerCase();
  if (!q) {
    return entry.profile_key === activeProfileKey ? 1000 + entry.visited_at / 1e13 : entry.visited_at / 1e13;
  }
  const url = entry.url.toLowerCase();
  const title = entry.title.toLowerCase();
  let score = 0;
  if (url.startsWith(q) || url.includes(`://${q}`) || url.includes(`www.${q}`)) {
    score += 100;
  } else if (url.includes(q)) {
    score += 60;
  }
  if (title.startsWith(q)) {
    score += 40;
  } else if (title.includes(q)) {
    score += 20;
  }
  if (score === 0) return 0;
  if (entry.profile_key === activeProfileKey) score += 50;
  // Recency tie-break (visited_at is ms).
  score += Math.min(10, entry.visited_at / 1e14);
  return score;
}

export function suggestHistory(
  query: string,
  entries: BrowserHistoryEntry[],
  activeProfileKey: string | null,
  limit = 8,
): BrowserHistoryEntry[] {
  const scored = entries
    .map((e) => ({ e, score: scoreHistoryMatch(query, e, activeProfileKey) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.e.visited_at - a.e.visited_at);
  const seen = new Set<string>();
  const out: BrowserHistoryEntry[] = [];
  for (const { e } of scored) {
    const key = `${e.profile_key}\0${e.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

export function isBookmarked(
  bookmarks: BrowserBookmark[],
  url: string,
  profileKey: string | null,
): BrowserBookmark | null {
  if (!profileKey) return null;
  return bookmarks.find((b) => b.url === url && b.profile_key === profileKey) ?? null;
}

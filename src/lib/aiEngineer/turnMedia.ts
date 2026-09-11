/** Collect image media refs produced by tools in the current user turn. */

export type ToolMediaRef = {
  mediaId: string;
  sourceUrl?: string;
};

const MEDIA_ID_RE = /^[a-fA-F0-9]{16,128}$/;

function pushMediaRef(
  out: ToolMediaRef[],
  seen: Set<string>,
  mediaId: string | undefined,
  sourceUrl?: string,
): void {
  const id = typeof mediaId === "string" ? mediaId.trim() : "";
  if (!id || !MEDIA_ID_RE.test(id) || seen.has(id)) return;
  seen.add(id);
  out.push({
    mediaId: id,
    sourceUrl: typeof sourceUrl === "string" ? sourceUrl : undefined,
  });
}

/** All image media refs in a single tool payload (image or HTML with images[]). */
export function extractToolImageMediaList(
  output: string | undefined | null,
): ToolMediaRef[] {
  if (!output?.trim()) return [];
  try {
    const parsed = JSON.parse(output) as {
      kind?: string;
      media_id?: string;
      url?: string;
      ok?: boolean;
      images?: Array<{ media_id?: string; url?: string }>;
    };
    if (parsed?.ok === false) return [];
    const seen = new Set<string>();
    const out: ToolMediaRef[] = [];
    if (Array.isArray(parsed.images)) {
      for (const img of parsed.images) {
        pushMediaRef(out, seen, img?.media_id, img?.url);
      }
    }
    // Direct image fetch, or HTML that only set top-level media_id.
    if (parsed.kind === "image" || out.length === 0) {
      pushMediaRef(out, seen, parsed.media_id, parsed.url);
    }
    return out;
  } catch {
    return [];
  }
}

export function extractToolImageMedia(
  output: string | undefined | null,
): ToolMediaRef | null {
  return extractToolImageMediaList(output)[0] ?? null;
}

/** Media ids from tool lines after the latest user message, de-duplicated. */
export function collectTurnImageMedia(
  messages: Array<{ kind: string; output?: string }>,
  upToIndex: number,
): ToolMediaRef[] {
  let lastUser = -1;
  for (let i = 0; i <= upToIndex && i < messages.length; i += 1) {
    if (messages[i].kind === "user") lastUser = i;
  }
  const start = lastUser + 1;
  const seen = new Set<string>();
  const out: ToolMediaRef[] = [];
  for (let i = start; i <= upToIndex && i < messages.length; i += 1) {
    const line = messages[i];
    if (line.kind !== "tool") continue;
    for (const ref of extractToolImageMediaList(line.output)) {
      if (seen.has(ref.mediaId)) continue;
      seen.add(ref.mediaId);
      out.push(ref);
    }
  }
  return out;
}

/** True when markdown already embeds at least one image. */
export function markdownHasImage(content: string | undefined | null): boolean {
  const raw = content || "";
  if (/!\[[^\]]*\]\([^)]+\)/.test(raw)) return true;
  if (/<img\b/i.test(raw)) return true;
  return false;
}

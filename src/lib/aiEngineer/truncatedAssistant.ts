/** Detect / merge assistant replies that stopped mid-structure (UI helper).
 *
 * Keep in sync with agent-sidecar `looks_like_truncated_answer`: structural only
 * (fences, bold, tables, brackets, headings) — no language keyword lists.
 */

const MD_HEADING_LINE = /^#{1,6}\s+\S/;
const MD_HEADING_CAPTURE = /^(#{1,6}\s+)(.+?)\s*$/;
const TABLE_SEP_CELL = /^:?-{3,}:?$/;

function looksLikeIncompleteMdTable(raw: string, last: string): boolean {
  if (!last.startsWith("|")) return false;
  if (!last.endsWith("|")) return true;
  const cells = last
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
  if (!cells.length) return true;
  if (cells.every((c) => TABLE_SEP_CELL.test(c))) return true;
  if (cells[cells.length - 1] === "" && raw.length >= 60) return true;
  const tableLines = raw
    .split("\n")
    .map((ln) => ln.trim())
    .filter((ln) => ln.startsWith("|"));
  if (tableLines.length >= 2) {
    const headerCells = tableLines[0]
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
    if (headerCells.length && cells.length < headerCells.length) return true;
    if (tableLines.length === 2) {
      const sepCells = tableLines[1]
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim());
      if (sepCells.every((c) => TABLE_SEP_CELL.test(c))) return true;
    }
  }
  return false;
}

/** Drop a trailing markdown heading with no body (common local-model restart). */
export function stripTrailingDanglingHeading(text: string): string {
  let raw = (text || "").replace(/\s+$/, "");
  if (!raw) return "";

  const titleSeenIn = (body: string, title: string): boolean => {
    if (!title) return false;
    return body.split("\n").some((ln) => {
      const m = ln.trim().match(MD_HEADING_CAPTURE);
      return Boolean(m && m[2].trim() === title);
    });
  };

  for (;;) {
    const lines = raw.split("\n");
    const last = (lines[lines.length - 1] || "").trim();
    if (!last || !MD_HEADING_LINE.test(last)) break;
    const title = last.replace(/^#{1,6}\s+/, "").trim();
    const earlier = lines.slice(0, -1).join("\n");
    if (!titleSeenIn(earlier, title) && earlier.trim().length < 80) break;
    lines.pop();
    raw = lines.join("\n").replace(/\s+$/, "");
  }

  const lines = raw.split("\n");
  if (lines.length) {
    const last = lines[lines.length - 1] || "";
    const glued = /^(.*\S)\s+(#{1,6}\s+\S.*?)\s*$/.exec(last);
    if (glued) {
      const before = glued[1];
      const heading = glued[2];
      const title = heading.replace(/^#{1,6}\s+/, "").trim();
      const earlier = lines.slice(0, -1).join("\n");
      if (
        titleSeenIn(earlier, title) ||
        before.replace(/\s/g, "").length >= 40
      ) {
        lines[lines.length - 1] = before.replace(/\s+$/, "");
        raw = lines.join("\n").replace(/\s+$/, "");
      }
    }
  }
  return raw;
}

export function looksTruncatedAssistant(text: string | undefined | null): boolean {
  const probe = (text || "").trimEnd();
  if (!probe) return false;
  const fences = probe.match(/```/g);
  if (fences && fences.length % 2 === 1) return true;
  const boldMarks = probe.match(/\*\*/g);
  if (boldMarks && boldMarks.length % 2 === 1) return true;
  if (
    /[`（(\[]\s*(?:[A-Za-z][A-Za-z0-9._/\-]{0,48}|[\u4e00-\u9fff]{1,4})$/.test(
      probe,
    )
  ) {
    return true;
  }
  if (/[([{（][^)\]}）\n]{0,40}$/.test(probe)) return true;
  const lines = probe.split("\n");
  const last = (lines[lines.length - 1] || probe).trim();
  // Closed fences end with ``` — complete. Lone trailing ` = cut inline code.
  if (/[(（\[{：:,，、]$/.test(last)) return true;
  if (/`$/.test(last) && !/```$/.test(last)) return true;
  if (last && looksLikeIncompleteMdTable(probe, last)) return true;
  if (last.startsWith("│") && probe.length >= 80) return true;
  if (/\S\s+#{1,6}\s+\S/.test(last) && probe.length >= 80) return true;
  if (last && MD_HEADING_LINE.test(last) && probe.length >= 80) return true;
  const headings = [
    ...probe.matchAll(/^(#{1,6}\s+)(.+?)\s*$/gm),
  ].map((m) => m[2].trim());
  if (
    headings.length >= 2 &&
    headings[headings.length - 1] === headings[0] &&
    MD_HEADING_LINE.test(last || "")
  ) {
    return true;
  }
  return false;
}

function leadingHeadingTitle(text: string): string | null {
  const first = (text.trimStart().split("\n")[0] || "").trim();
  const m = first.match(MD_HEADING_CAPTURE);
  return m ? m[2].trim() : null;
}

/** Glue a table-row continuation so markdown stays one table. */
export function joinMarkdownTableContinuation(
  previous: string,
  incoming: string,
): string | null {
  const prev = previous || "";
  if (!prev || !incoming) return null;
  const lines = prev.split("\n");
  const last = lines[lines.length - 1] || "";
  const lastTrim = last.trim();
  if (!lastTrim.startsWith("|")) return null;
  // Mid-cell cut: prior row has no closing pipe; glue the suffix (keep spaces).
  if (!lastTrim.endsWith("|")) {
    return prev + incoming.replace(/^\n+/, "");
  }
  // Complete row then more rows — keep a single newline between them.
  const nextRows = incoming.replace(/^\s+/, "");
  if (nextRows.startsWith("|")) {
    const sep = prev.endsWith("\n") ? "" : "\n";
    return prev + sep + nextRows;
  }
  return null;
}

function bodyHasHeadingTitle(body: string, title: string): boolean {
  if (!title) return false;
  return body.split("\n").some((ln) => {
    const m = ln.trim().match(MD_HEADING_CAPTURE);
    return m && m[2].trim() === title;
  });
}

/** Merge a continuation chunk into a truncated prior reply.
 *
 * Trunc-continue `assistant_message` payloads are authoritative full text:
 * if `next` already contains the prior opening or is nearly as long, replace
 * instead of concatenating (avoids duplicated answers).
 */
export function mergeAssistantContinuation(
  previous: string,
  incoming: string,
): string {
  const prev = previous || "";
  const next = incoming || "";
  if (!prev) return stripTrailingDanglingHeading(next) || next;
  if (!next) return stripTrailingDanglingHeading(prev) || prev;

  const tableJoinEarly = joinMarkdownTableContinuation(prev, next);
  if (tableJoinEarly != null && looksTruncatedAssistant(prev)) {
    return stripTrailingDanglingHeading(tableJoinEarly) || tableJoinEarly;
  }

  // Streamed previews often gain leading newlines and miss the final terminator
  // that the sanitized assistant_message still has — prefer the cleaned final.
  const prevCore = prev.replace(/^\s+/, "").replace(/\s+$/, "");
  const nextCore = next.replace(/^\s+/, "").replace(/\s+$/, "");
  if (prevCore && nextCore) {
    const prevSansTerm = prevCore.replace(/[。！？.!?…]+$/u, "");
    const nextSansTerm = nextCore.replace(/[。！？.!?…]+$/u, "");
    if (
      prevSansTerm === nextSansTerm ||
      nextCore.startsWith(prevSansTerm) ||
      prevCore.startsWith(nextSansTerm)
    ) {
      if (nextCore.length >= prevSansTerm.length) {
        return stripTrailingDanglingHeading(nextCore) || nextCore;
      }
    }
  }

  const prevOpen = prev.slice(0, Math.min(120, prev.length)).trim();
  // Authoritative rewrite / full-sample replace.
  if (
    prevOpen.length >= 40 &&
    next.includes(prevOpen) &&
    next.length >= Math.floor(prev.length * 0.6)
  ) {
    return stripTrailingDanglingHeading(next) || next;
  }
  if (
    next.length >= Math.floor(prev.length * 0.9) &&
    (next.startsWith(prev.slice(0, Math.min(48, prev.length))) ||
      !looksTruncatedAssistant(next))
  ) {
    return stripTrailingDanglingHeading(next) || next;
  }

  const nextTitle = leadingHeadingTitle(next);
  const restart =
    Boolean(nextTitle) && bodyHasHeadingTitle(prev, nextTitle || "");

  // Model restarted the same section instead of continuing.
  if (restart) {
    const cleanedNext = stripTrailingDanglingHeading(next) || next;
    if (
      cleanedNext.length >= Math.floor(prev.length * 0.85) &&
      !looksTruncatedAssistant(cleanedNext)
    ) {
      return cleanedNext;
    }
    // Only a heading (or heading + tiny stub) — keep prior, drop restart.
    const bodyOnly = cleanedNext
      .replace(/^#{1,6}\s+[^\n]+\n*/, "")
      .trim();
    if (!bodyOnly || bodyOnly.length < 12) {
      return stripTrailingDanglingHeading(prev) || prev;
    }
    // Full rewrite that already contains the prior opening prose.
    const open = prev.slice(0, Math.min(80, prev.length));
    if (
      open.length >= 40 &&
      cleanedNext.includes(open) &&
      !looksTruncatedAssistant(cleanedNext)
    ) {
      return stripTrailingDanglingHeading(cleanedNext) || cleanedNext;
    }
    // Prior was cut mid-sentence — strip the restarted heading and append body.
    if (looksTruncatedAssistant(prev)) {
      const sep = prev.endsWith("\n") ? "" : "\n";
      return (
        stripTrailingDanglingHeading(`${prev}${sep}${bodyOnly}`) ||
        `${prev}${sep}${bodyOnly}`
      );
    }
    return stripTrailingDanglingHeading(prev) || prev;
  }

  if (!looksTruncatedAssistant(prev)) {
    // Prior looked finished; prefer incoming if it is a full replacement.
    if (next.length >= Math.floor(prev.length * 0.85)) {
      return stripTrailingDanglingHeading(next) || next;
    }
    return stripTrailingDanglingHeading(prev) || prev;
  }

  // Short suffix only — append when prior is structurally truncated.
  if (
    next.length < Math.floor(prev.length * 0.5) &&
    looksTruncatedAssistant(prev)
  ) {
    const tableJoin = joinMarkdownTableContinuation(prev, next);
    if (tableJoin != null) {
      return stripTrailingDanglingHeading(tableJoin) || tableJoin;
    }
    const needSep =
      !prev.endsWith("\n") &&
      !next.startsWith("\n") &&
      /[`）)\w\u4e00-\u9fff]$/.test(prev) &&
      /^#{1,6}\s/.test(next.trimStart());
    const joined = needSep ? `${prev}\n\n${next}` : prev + next;
    return stripTrailingDanglingHeading(joined) || joined;
  }

  // Prefer next when it looks like a completed rewrite of similar length.
  if (
    next.length >= Math.floor(prev.length * 0.85) &&
    !looksTruncatedAssistant(next)
  ) {
    return stripTrailingDanglingHeading(next) || next;
  }

  // Avoid gluing " ## heading" onto the previous line.
  const needSep =
    !prev.endsWith("\n") &&
    !next.startsWith("\n") &&
    /[`）)\w\u4e00-\u9fff]$/.test(prev) &&
    /^#{1,6}\s/.test(next.trimStart());
  const joined = needSep ? `${prev}\n\n${next}` : prev + next;
  return stripTrailingDanglingHeading(joined) || joined;
}

/**
 * Choose final assistant text for an `assistant_message` event.
 * Trunc-continue samples often emit only the suffix — never wipe a longer
 * truncated prior with a short replace.
 */
export function resolveAuthoritativeAssistantContent(
  previous: string,
  incoming: string,
  opts?: { replace?: boolean },
): string {
  const prev = previous || "";
  const nextRaw = incoming || "";
  const next = stripTrailingDanglingHeading(nextRaw) || nextRaw;
  if (!prev) return next;
  if (opts?.replace === false) {
    return mergeAssistantContinuation(prev, nextRaw);
  }
  const prevOpen = prev.slice(0, Math.min(60, prev.length)).trim();
  if (
    looksTruncatedAssistant(prev) &&
    next.length < Math.floor(prev.length * 0.85) &&
    !(prevOpen.length >= 20 && next.includes(prevOpen))
  ) {
    return mergeAssistantContinuation(prev, nextRaw);
  }
  return next;
}

/** Detect / merge assistant replies that stopped mid-sentence (UI helper). */

const CJK_INCOMPLETE_TAIL =
  /(?:然后|接着|接下来|并且|以及|或者|因为|所以|但是|不过|如果|再去|再把|再从|先把|先从)[\u4e00-\u9fff]{0,2}\s*$/;
const MD_HEADING_LINE = /^#{1,6}\s+\S/;
const MD_HEADING_CAPTURE = /^(#{1,6}\s+)(.+?)\s*$/;

function cjkCount(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/g) || []).length;
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
  if (/[`（(]\s*[A-Za-z][A-Za-z0-9._/\-]{0,48}$/.test(probe)) return true;
  const lines = probe.split("\n");
  const last = (lines[lines.length - 1] || probe).trim();
  if (/[(（\[{：:,，、`]$/.test(last)) return true;
  if (last && CJK_INCOMPLETE_TAIL.test(last)) return true;
  // Mid ASCII box-drawing line (incomplete diagram).
  if (last.startsWith("│") && probe.length >= 80) return true;
  // Heading glued mid-line or dangling heading.
  if (/\S\s+#{1,6}\s+\S/.test(last) && probe.length >= 80) return true;
  if (last && MD_HEADING_LINE.test(last) && probe.length >= 80) return true;
  if (probe.length < 60) return false;
  if (probe.endsWith("```")) return false;
  if (cjkCount(probe) >= 40 && last) {
    if (
      cjkCount(last) >= 8 &&
      last.length >= 10 &&
      !/^[#\-* >|]/.test(last) &&
      !/[。！？….!?]/.test(last.slice(-1)) &&
      !/[)）`'」』"]$/.test(last)
    ) {
      return true;
    }
  }
  return false;
}

function leadingHeadingTitle(text: string): string | null {
  const first = (text.trimStart().split("\n")[0] || "").trim();
  const m = first.match(MD_HEADING_CAPTURE);
  return m ? m[2].trim() : null;
}

function bodyHasHeadingTitle(body: string, title: string): boolean {
  if (!title) return false;
  return body.split("\n").some((ln) => {
    const m = ln.trim().match(MD_HEADING_CAPTURE);
    return m && m[2].trim() === title;
  });
}

/** Merge a continuation chunk into a truncated prior reply. */
export function mergeAssistantContinuation(
  previous: string,
  incoming: string,
): string {
  const prev = previous || "";
  const next = incoming || "";
  if (!prev) return stripTrailingDanglingHeading(next) || next;
  if (!next) return stripTrailingDanglingHeading(prev) || prev;

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
    const prevOpen = prev.slice(0, Math.min(80, prev.length));
    if (
      prevOpen.length >= 40 &&
      cleanedNext.includes(prevOpen) &&
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

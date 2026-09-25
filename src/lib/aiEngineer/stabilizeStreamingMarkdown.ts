/**
 * Streaming markdown pre-pass before `marked`.
 *
 * marked follows CommonMark flanking rules that routinely fail on CJK
 * (e.g. `**最终建议：**` / `显存**，…**` leave literal asterisks). Patching
 * each punct pattern forever is a losing game — for chat we own `**…**`
 * outside fences/inline code and emit `<strong>` ourselves.
 *
 * Also handles stream-only artifacts marked cannot know about mid-token:
 * - bare ``` diagrams that continue into prose without a closer
 * - dangling ** while streaming
 * - half-typed table rows / empty fences
 *
 * Language-tagged fences (```bash, ```python, …) are real code — do NOT
 * heuristically splice them.
 */

const FENCE_LINE = /^([`~]{3,})(.*)$/;
const BOX_DRAWING = /[┌┐└┘├┤┬┴┼─│┃┏┓┗┛━═║╔╗╚╝╠╣╦╩╬█▀▄▌▐]/
/** Cap a single bold span so a stray opener cannot swallow a whole essay. */
const BOLD_SPAN_MAX = 400;

function fenceCloser(opener: string): string {
  const ch = opener[0] === "~" ? "~" : "`";
  return ch.repeat(Math.max(3, opener.length));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Non-empty fence info string → intentional code block, not a bare diagram. */
export function isLanguageTaggedFence(info: string | undefined): boolean {
  return Boolean((info || "").trim());
}

/** Lines that still belong inside a diagram / code fence. */
export function looksLikeFenceBodyLine(line: string): boolean {
  if (/^\s*$/.test(line)) return true;
  if (BOX_DRAWING.test(line)) return true;
  if (/^\s*\|.*\|\s*$/.test(line)) return true;
  if (/^ {4,}|\t/.test(line)) return true;
  const t = line.trim();
  // Short label / title without sentence punctuation or emphasis.
  if (
    t.length > 0 &&
    t.length <= 28 &&
    !/\*\*|__|\[|\]|#/.test(t) &&
    !/[。！？；：，]/.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * Prose that accidentally continued after an unclosed *bare* fence.
 * Must stay conservative: version tokens (Qwen2.5) and shell flags are not prose.
 */
export function looksLikeProseLeakingFromFence(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (looksLikeFenceBodyLine(line)) return false;
  if (/^\*\*/.test(t) || /\*\*[^*]+\*\*/.test(t)) return true;
  if (/^#{1,6}\s+\S/.test(t)) return true;
  if (/^[-*+]\s+\S/.test(t)) return true;
  if (/^\d+\.\s+\S/.test(t)) return true;
  if (/[\u4e00-\u9fff]/.test(t) && /[，。！？；：]/.test(t)) return true;
  if (/[\u4e00-\u9fff]{4,}/.test(t) && t.length >= 12) return true;
  // English sentence — require real clause breaks, not `pkg.2.5` / `file.txt` dots.
  if (/^[A-Za-z]/.test(t) && t.length >= 24) {
    const withoutVersions = t.replace(/\b[\w+-]+(?:\.\d[\w.+-]*)+/g, "§");
    if (/(?:[.!?])\s+[A-Z]/.test(withoutVersions)) return true;
    if (/[.!?]$/.test(withoutVersions.trim())) return true;
  }
  return false;
}

/**
 * Close a *bare* fence before leaked prose, and close any still-open fence at EOF.
 * Tagged fences (```bash …) are left alone until a real closer or EOF.
 */
export function closeProseLeakingCodeFence(content: string): string {
  if (!content.includes("```") && !content.includes("~~~")) return content;
  const lines = content.split("\n");
  const out: string[] = [];
  let inFence = false;
  let closer = "```";
  /** When true, never splice on prose-leak heuristics. */
  let trustFenceBody = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = line.match(FENCE_LINE);
    if (fence && !inFence) {
      inFence = true;
      closer = fenceCloser(fence[1]!);
      trustFenceBody = isLanguageTaggedFence(fence[2]);
      out.push(line);
      continue;
    }
    if (fence && inFence && line.trim().startsWith(closer[0]!)) {
      // Same fence family (``` or ~~~) closes.
      if (
        (closer[0] === "`" && fence[1]!.startsWith("`")) ||
        (closer[0] === "~" && fence[1]!.startsWith("~"))
      ) {
        inFence = false;
        trustFenceBody = false;
        out.push(line);
        continue;
      }
    }

    if (inFence && !trustFenceBody && looksLikeProseLeakingFromFence(line)) {
      // Keep blank lines with the prose, not inside the fence.
      while (out.length > 0 && /^\s*$/.test(out[out.length - 1]!)) {
        out.pop();
      }
      out.push(closer);
      inFence = false;
      trustFenceBody = false;
      // Re-insert a blank separator when the leak was preceded by blanks.
      if (i > 0 && /^\s*$/.test(lines[i - 1]!)) {
        out.push("");
      }
    }
    out.push(line);
  }

  if (inFence) {
    out.push(closer);
  }
  return out.join("\n");
}

/** Odd trailing ** while streaming leaves literal asterisks until the closer arrives. */
export function closeDanglingBoldMarkers(content: string): string {
  // Ignore fences — operate on the stabilized string after fence close.
  const parts = content.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/);
  let changed = false;
  const next = parts.map((part, idx) => {
    // Odd split indices are fenced blocks when the regex matched.
    if (idx % 2 === 1) return part;
    // Also ignore inline code when counting markers.
    const chunks = part.split(/(`[^`]*`)/);
    let marks = 0;
    for (let i = 0; i < chunks.length; i++) {
      if (i % 2 === 1) continue;
      marks += (chunks[i]!.match(/\*\*/g) || []).length;
    }
    if (marks % 2 === 1) {
      changed = true;
      return `${part}**`;
    }
    return part;
  });
  return changed ? next.join("") : content;
}

/**
 * Turn complete `**…**` pairs into `<strong>` so CommonMark flanking cannot
 * leave literal asterisks next to CJK punctuation.
 */
export function materializeBoldMarkers(content: string): string {
  if (!content.includes("**")) return content;
  const fenceParts = content.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/);
  return fenceParts
    .map((part, idx) => {
      if (idx % 2 === 1) return part;
      return materializeBoldOutsideInlineCode(part);
    })
    .join("");
}

function materializeBoldOutsideInlineCode(text: string): string {
  const chunks = text.split(/(`[^`]*`)/);
  return chunks
    .map((chunk, i) => {
      if (i % 2 === 1) return chunk;
      return chunk.replace(/\*\*((?:(?!\*\*)[\s\S])+?)\*\*/g, (full, inner) => {
        const body = String(inner);
        if (!body.trim() || body.length > BOLD_SPAN_MAX) return full;
        return `<strong>${escapeHtml(body)}</strong>`;
      });
    })
    .join("");
}

/**
 * @deprecated Prefer materializeBoldMarkers. Kept for tests / call sites that
 * still normalize punct before HTML materialization.
 */
export function fixCjkBoldOpeningPunctuation(content: string): string {
  if (!content.includes("**")) return content;
  return content.replace(
    /([^\s*`])\*\*([。！？；：，、])((?:(?!\*\*)[\s\S])+?)\*\*/g,
    "$1$2**$3**",
  );
}

/**
 * @deprecated Prefer materializeBoldMarkers.
 */
export function fixCjkBoldClosingPunctuation(content: string): string {
  if (!content.includes("**")) return content;
  return content.replace(
    /\*\*((?:(?!\*\*)[\s\S])+?)([。！？；：，、])\*\*(?=\S|\s|$)/g,
    "**$1**$2",
  );
}

/** Drop empty ``` / ~~~ fences that paint as blank gray boxes. */
export function stripEmptyCodeFences(content: string): string {
  if (!content.includes("```") && !content.includes("~~~")) return content;
  return content
    .replace(/(^|\n)([`~]{3,})[^\n]*\n(?:[ \t]*\n)*\2[ \t]*(?=\n|$)/g, "$1")
    .replace(/\n{3,}/g, "\n\n");
}

const TOOL_CALL_XML_BLOCK =
  /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
const FUNCTION_XML_BLOCK =
  /<function\s*=\s*([A-Za-z_][\w]*)>([\s\S]*?)<\/function>/gi;
const PARAMETER_XML =
  /<parameter\s*=\s*([A-Za-z_][\w]*)>\s*([\s\S]*?)\s*<\/parameter>/gi;

function fenceFor(body: string, lang: string): string {
  let ticks = "```";
  while (body.includes(ticks)) ticks += "`";
  return `${ticks}${lang}\n${body.replace(/\n$/, "")}\n${ticks}`;
}

function formatXmlFunctionAsMarkdown(name: string, inner: string): string {
  const params: Record<string, string> = {};
  const paramRe = new RegExp(PARAMETER_XML.source, "gi");
  for (const m of inner.matchAll(paramRe)) {
    const key = (m[1] || "").trim();
    if (!key) continue;
    params[key] = (m[2] || "").trim();
  }
  const command = params.command || params.cmd || "";
  const intent = params.intent || params.goal || "";
  const url = params.url || "";
  const query = params.query || "";
  // web_* dumps must not become a gray wall of `url:` / `goal:` lines — match
  // the compact web_search tool-card look (title + one backtick line).
  if (name === "web_fetch" || name === "web_search") {
    const primary = name === "web_search" ? query : url;
    const title = intent || primary;
    const parts: string[] = [];
    if (title) parts.push(`**${title.replace(/\*\*/g, "")}**`);
    if (primary && primary !== title) {
      parts.push("`" + primary.replace(/`/g, "'") + "`");
    } else if (!intent && primary) {
      parts.push("`" + primary.replace(/`/g, "'") + "`");
    }
    return parts.join("\n") || "`" + name + "`";
  }
  const parts: string[] = [];
  if (intent) parts.push(`**${intent.replace(/\*\*/g, "")}**`);
  if (command) {
    parts.push(fenceFor(command, "bash"));
  } else {
    const dump = Object.entries(params)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    parts.push(fenceFor(`${name}\n${dump}`.trim(), ""));
  }
  return parts.join("\n\n");
}

/**
 * Models sometimes paste ``<tool_call><function=…>`` as assistant text.
 * marked leaves the tags; the browser then treats them as unknown HTML and
 * only shows parameter bodies stuck together. Rewrite to markdown fences so
 * history reopen still looks like a command, not a word salad.
 */
export function rewriteToolCallMarkupForDisplay(content: string): string {
  if (!content) return content;
  const lower = content.toLowerCase();
  if (!lower.includes("<tool_call>") && !lower.includes("<function=")) {
    return content;
  }

  const toolRe = new RegExp(TOOL_CALL_XML_BLOCK.source, "gi");
  let out = content.replace(toolRe, (_full, body: string) => {
    const chunks: string[] = [];
    let matched = false;
    const fnRe = new RegExp(FUNCTION_XML_BLOCK.source, "gi");
    for (const fm of String(body).matchAll(fnRe)) {
      matched = true;
      chunks.push(formatXmlFunctionAsMarkdown(fm[1] || "tool", fm[2] || ""));
    }
    if (matched) return chunks.join("\n\n");
    const trimmed = String(body).trim();
    if (trimmed.startsWith("{")) return fenceFor(trimmed, "json");
    return fenceFor(trimmed, "");
  });

  const bareFn = new RegExp(FUNCTION_XML_BLOCK.source, "gi");
  out = out.replace(bareFn, (_full, name: string, inner: string) =>
    formatXmlFunctionAsMarkdown(name || "tool", inner || ""),
  );
  return out;
}

const TABLE_SEP_CELL = /^:?-{3,}:?$/;

/**
 * Close a half-typed trailing table row so marked does not thrash column layout
 * (wide table streams otherwise yank scroll mid-bubble).
 */
export function stabilizeTrailingIncompleteTable(content: string): string {
  if (!content.includes("|")) return content;
  const lines = content.split("\n");
  let end = lines.length - 1;
  while (end >= 0 && /^\s*$/.test(lines[end]!)) end--;
  if (end < 0) return content;
  const last = lines[end]!;
  const trimmed = last.trim();
  if (!trimmed.startsWith("|")) return content;
  // Mid-row cut: `| **可用中继** | **2/3`
  if (!trimmed.endsWith("|")) {
    lines[end] = `${last.replace(/\s+$/, "")} |`;
    return lines.join("\n");
  }
  // Header + separator only (no body yet) — leave as-is; marked is stable enough.
  const cells = trimmed
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
  if (cells.length && cells.every((c) => TABLE_SEP_CELL.test(c))) {
    return content;
  }
  return content;
}

/** Prepare assistant markdown for marked so stream height stays close to final. */
export function stabilizeStreamingMarkdown(content: string): string {
  if (!content) return content;
  // Order: tool-call XML → fences → empty → dangling ** → bold → table.
  return stabilizeTrailingIncompleteTable(
    materializeBoldMarkers(
      closeDanglingBoldMarkers(
        stripEmptyCodeFences(
          closeProseLeakingCodeFence(rewriteToolCallMarkupForDisplay(content)),
        ),
      ),
    ),
  );
}

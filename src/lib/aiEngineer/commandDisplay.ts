/** Keep displayed shell clean — titles belong in the card header (`intent`). */

const BANNER_BODY =
  /^\s*[=─\-_*]{2,}[^=─\-_*].*[=─\-_*]{2,}\s*$|^\s*[=─\-_*]{3,}\s*$/;
const EMPTY_ECHO = /^\s*echo\s+(?:-e\s+)?(?:(['"])\s*\1)?\s*$/i;
const ECHO_CMD = /^\s*echo\b/i;
const COMMENT_LINE = /^\s*#/;
const BLANK = /^\s*$/;

export function extractCommandTitle(command: string): string {
  for (const line of command.replace(/\r\n/g, "\n").split("\n")) {
    if (BLANK.test(line)) continue;
    if (COMMENT_LINE.test(line)) return line.replace(/^\s*#\s?/, "").trim();
    break;
  }
  return "";
}

function isDecorativeEchoStatement(stmt: string): boolean {
  const s = stmt.trim();
  if (!s || !ECHO_CMD.test(s)) return false;
  if (EMPTY_ECHO.test(s)) return true;
  const idx = s.toLowerCase().indexOf("echo");
  const rest = s.slice(idx + 4).trim();
  if (!rest) return true;
  const m = rest.match(/^\s*(['"])([\s\S]*?)\1\s*$/);
  if (m) return BANNER_BODY.test(m[2] || "");
  return BANNER_BODY.test(rest);
}

function splitShellStatements(script: string): Array<{ stmt: string; sep: string }> {
  const text = script || "";
  const parts: Array<{ stmt: string; sep: string }> = [];
  let buf = "";
  let i = 0;
  let quote = "";
  while (i < text.length) {
    const ch = text[i]!;
    if (quote) {
      buf += ch;
      if (ch === "\\" && i + 1 < text.length && quote === '"') {
        buf += text[i + 1]!;
        i += 2;
        continue;
      }
      if (ch === quote) quote = "";
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      buf += ch;
      i += 1;
      continue;
    }
    if (ch === ";" && !(i + 1 < text.length && text[i + 1] === ";")) {
      parts.push({ stmt: buf, sep: ";" });
      buf = "";
      i += 1;
      continue;
    }
    if (text.startsWith("&&", i)) {
      parts.push({ stmt: buf, sep: "&&" });
      buf = "";
      i += 2;
      continue;
    }
    if (text.startsWith("||", i)) {
      parts.push({ stmt: buf, sep: "||" });
      buf = "";
      i += 2;
      continue;
    }
    buf += ch;
    i += 1;
  }
  parts.push({ stmt: buf, sep: "" });
  return parts;
}

function sanitizeLineStatements(line: string): string {
  const chunks = splitShellStatements(line);
  const kept: Array<{ stmt: string; sep: string }> = [];
  for (const { stmt, sep } of chunks) {
    if (isDecorativeEchoStatement(stmt)) continue;
    if (BLANK.test(stmt) && !stmt.trim()) continue;
    kept.push({ stmt, sep });
  }
  if (!kept.length) return "";
  let out = "";
  for (let idx = 0; idx < kept.length; idx++) {
    const { stmt, sep } = kept[idx]!;
    out += idx === 0 ? stmt.replace(/\s+$/, "") : stmt.trim();
    if (idx < kept.length - 1) {
      const joiner = sep || ";";
      out += joiner === ";" ? "; " : ` ${joiner} `;
    }
  }
  return out.trim();
}

export function sanitizeDisplayCommand(command: string): string {
  const lines = command.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  let leading = true;
  for (const line of lines) {
    if (leading && BLANK.test(line)) continue;
    if (leading && COMMENT_LINE.test(line)) continue;
    leading = false;
    const cleaned = sanitizeLineStatements(line);
    if (!cleaned) continue;
    if (BLANK.test(cleaned) && (!out.length || BLANK.test(out[out.length - 1]!))) {
      continue;
    }
    out.push(cleaned);
  }
  while (out.length && BLANK.test(out[out.length - 1]!)) out.pop();
  return out.join("\n").trim();
}

/** Keep displayed shell clean — titles belong in the card header (`intent`). */

const DECORATIVE_ECHO =
  /^\s*echo\s+(?:-e\s+)?(['"])\s*=+[^=]*?=+\s*\1\s*$/i;
const EMPTY_ECHO = /^\s*echo\s+(?:-e\s+)?(['"])\s*\1\s*$/i;
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

export function sanitizeDisplayCommand(command: string): string {
  const lines = command.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  let leading = true;
  for (const line of lines) {
    if (leading && BLANK.test(line)) continue;
    if (leading && COMMENT_LINE.test(line)) continue;
    leading = false;
    if (DECORATIVE_ECHO.test(line) || EMPTY_ECHO.test(line)) continue;
    if (BLANK.test(line) && (!out.length || BLANK.test(out[out.length - 1]!))) {
      continue;
    }
    out.push(line);
  }
  while (out.length && BLANK.test(out[out.length - 1]!)) out.pop();
  return out.join("\n").trim();
}

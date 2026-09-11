import { buildLineColumnMap, stripAnsi } from "./terminalLinks";

function hasPromptTerminator(plain: string): boolean {
  const t = plain.trimEnd();
  return /[$#%](?:\s|$)/.test(t) || /[$#%]$/.test(t);
}

/** SSH/bash prompt start, including soft-wrapped rows that lack a trailing `$` yet. */
function looksLikeSshPromptStart(plain: string): boolean {
  const trimmed = plain.trim();
  if (/^[^@\s]+@[^:\s]+:(~|\/)/.test(trimmed)) return true;
  if (/:(~(?:\/[^$#%]*)?|\/[^$#%]*)\s*[$#%]/.test(trimmed)) return true;
  if (/(?:^|\s)(~(?:\/[^%#]*)?|\/[^%#]*)\s*[%#](?:\s|$)/.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Soft-wrapped prompts (deep cwd) span multiple buffer rows. Join them so
 * `parsePromptCwd` sees the full `~/…/observation.images…$` path.
 */
export function assemblePromptRegion(
  getLinePlain: (lineNumber: number) => string | null,
  startLine: number,
  stopBefore: number,
): { plain: string; endLine: number } {
  const first = getLinePlain(startLine);
  if (!first) return { plain: "", endLine: startLine };
  let plain = stripAnsi(first).replace(/\s+$/g, "");
  let endLine = startLine;
  if (!looksLikeSshPromptStart(plain) || hasPromptTerminator(plain)) {
    return { plain, endLine };
  }
  const limit = Math.min(stopBefore - 1, startLine + 8);
  for (let j = startLine + 1; j <= limit; j += 1) {
    const cont = getLinePlain(j);
    if (cont == null) break;
    const piece = stripAnsi(cont).replace(/^\s+/g, "").replace(/\s+$/g, "");
    if (!piece) break;
    // A brand-new prompt on the next row — stop.
    if (
      j > startLine + 1 &&
      /^[^@\s]+@[^:\s]+:(~|\/)/.test(piece) &&
      hasPromptTerminator(piece)
    ) {
      break;
    }
    plain += piece;
    endLine = j;
    if (hasPromptTerminator(plain)) break;
  }
  return { plain, endLine };
}

export function parsePromptCwd(line: string): string | null {
  const plain = stripAnsi(line).trim();
  // SSH / bash: user@host:~/path$ — path may contain spaces (e.g. Chinese folder names).
  const colonMatch = plain.match(/:(~(?:\/[^$#%]*)?|\/[^$#%]*)[\s$#%]/);
  if (colonMatch?.[1]) {
    return colonMatch[1];
  }
  // zsh: ~/path %  or  /abs/path %
  const zshMatch = plain.match(
    /(?:^|\s)(~(?:\/[^%#]*)?|\/[^%#]*)\s*[%#](?:\s|$)/,
  );
  if (zshMatch?.[1]) {
    return zshMatch[1];
  }
  return null;
}

export function joinRemotePath(parent: string, name: string): string {
  if (name === "..") {
    if (parent === "~") return "~";
    if (parent.startsWith("~/")) {
      const parts = parent.slice(2).split("/").filter(Boolean);
      parts.pop();
      return parts.length === 0 ? "~" : `~/${parts.join("/")}`;
    }
    if (parent === "/") return "/";
    if (parent.startsWith("/")) {
      const parts = parent.split("/").filter(Boolean);
      parts.pop();
      return parts.length === 0 ? "/" : `/${parts.join("/")}`;
    }
    return parent;
  }

  if (name.startsWith("/") || name.startsWith("~/") || name === "~") {
    return name;
  }

  if (parent === "~") return `~/${name}`;
  if (parent.startsWith("~/")) return `${parent}/${name}`;
  if (parent === "/") return `/${name}`;
  if (parent.startsWith("/")) {
    return `${parent.replace(/\/$/, "")}/${name}`;
  }

  return `${parent}/${name}`;
}

/** Normalize shell path arguments (quotes, ~/’dir’ segments, etc.). */
export function unquoteShellWord(word: string): string {
  let result = word.trim();
  if (
    (result.startsWith("'") && result.endsWith("'")) ||
    (result.startsWith('"') && result.endsWith('"'))
  ) {
    return result.slice(1, -1);
  }

  // e.g. cd ~/'downloads' or /'My Dir' — strip quotes around individual path segments
  result = result.replace(/\/'([^']*)'/g, "/$1");
  result = result.replace(/\/"([^"]*)"/g, "/$1");
  result = result.replace(/^~\/'([^']*)'/, "~/$1");
  result = result.replace(/^~\/"([^"]*)"/, "~/$1");

  return result;
}

function isLikelyShellPromptLine(line: string): boolean {
  const trimmed = stripAnsi(line).trim();
  // Soft-wrapped deep cwd: first row is `user@host:~/very/long…` without `$` yet.
  if (/^[^@\s]+@[^:\s]+:(~|\/)/.test(trimmed)) return true;
  // Allow spaces in cwd so prompts like `user@host:/data/My Folder$` still count.
  if (/:(~(?:\/[^$#%]*)?|\/[^$#%]*)\s*[$#%]/.test(trimmed)) return true;
  if (/(?:^|\s)(~(?:\/[^%#]*)?|\/[^%#]*)\s*[%#](?:\s|$)/.test(trimmed)) {
    return true;
  }
  if (/[@:][^$#%]+[$#%]/.test(trimmed)) return true;
  return false;
}

function isLsCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  if (/^ls(\s|$)/.test(trimmed)) return true;
  if (/(?:&&|;)\s*ls(\s|$)/.test(trimmed)) return true;
  return false;
}

/** True when a buffer line itself is (or continues) an ls invocation. */
function isLsCommandLine(line: string): boolean {
  const trimmed = stripAnsi(line).trim();
  if (!trimmed) return false;
  if (isLsCommand(trimmed)) return true;
  // Wrapped fragment, e.g. `...dir' && ls -F` on its own buffer row.
  if (/(?:^|&&|;)\s*ls(?:\s|$)/.test(trimmed)) return true;
  return false;
}

function extractCommandLine(line: string): string {
  const plain = stripAnsi(line).trim();
  const afterPrompt = plain.match(
    /:(~(?:\/[^$#%]*)?|\/[^$#%]*)\s*[$#%]\s*(.*)$/,
  );
  if (afterPrompt?.[2]?.trim()) {
    return afterPrompt[2].trim();
  }
  const zshMatch = plain.match(
    /(?:^|\s)(~(?:\/[^%#]*)?|\/[^%#]*)\s*[%#]\s*(.*)$/,
  );
  if (zshMatch?.[2]?.trim()) {
    return zshMatch[2].trim();
  }
  return "";
}

/**
 * Join a prompt line's command with wrapped continuation rows beneath it.
 * Long `cd '…' && ls -F` lines commonly wrap before `ls`, which used to hide links.
 */
function extractCommandFromPromptRegion(
  getLinePlain: (lineNumber: number) => string | null,
  promptLineNumber: number,
  stopBeforeLine: number,
): string {
  const { plain: promptText, endLine } = assemblePromptRegion(
    getLinePlain,
    promptLineNumber,
    stopBeforeLine,
  );
  let cmd = extractCommandLine(promptText);

  for (let j = endLine + 1; j < stopBeforeLine; j += 1) {
    const cont = getLinePlain(j);
    if (cont == null) continue;
    const trimmed = stripAnsi(cont).trim();
    if (!trimmed) continue;
    if (isLikelyShellPromptLine(cont) && hasPromptTerminator(trimmed)) break;

    if (commandLooksIncomplete(cmd) || isLsCommandLine(cont)) {
      cmd = joinCommandWrap(cmd, trimmed);
      continue;
    }

    // Command already looks complete — don't swallow ls listing rows.
    if (looksLikeLsListingLine(trimmed)) break;

    // Still joining a wrapped `cd …` that hasn't reached `&& ls` yet.
    if (!isLsCommand(cmd) && /^\s*cd\b/i.test(cmd)) {
      cmd = joinCommandWrap(cmd, trimmed);
      continue;
    }

    break;
  }

  return cmd.trim();
}

/** Soft-wrapped buffer rows abut; don't insert spaces into paths like `希望学`+`网课`. */
function joinCommandWrap(cmd: string, next: string): string {
  if (!cmd) return next;
  if (commandLooksIncomplete(cmd)) {
    return cmd + next;
  }
  return `${cmd} ${next}`;
}

function commandLooksIncomplete(cmd: string): boolean {
  const trimmed = cmd.trim();
  if (!trimmed) return true;
  const singles = (trimmed.match(/'/g) ?? []).length;
  if (singles % 2 === 1) return true;
  const doubles = (trimmed.match(/"/g) ?? []).length;
  if (doubles % 2 === 1) return true;
  if (/&&\s*$/.test(trimmed) || /\|\s*$/.test(trimmed) || /;\s*$/.test(trimmed)) {
    return true;
  }
  if (/\bcd\s*$/i.test(trimmed)) return true;
  return false;
}

function looksLikeLsListingLine(trimmed: string): boolean {
  if (!trimmed) return false;
  if (/[;&|]/.test(trimmed)) return false;
  if (
    /^(?:cd|ls|echo|cat|vim?|nvim|mkdir|rm|mv|cp|touch|chmod|chown|pwd|export|source)\b/.test(
      trimmed,
    )
  ) {
    return false;
  }
  // Shell-quoted entry from GNU ls
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return true;
  }
  // Classify suffixes from `ls -F`
  if (/\/$/.test(trimmed) || /[@*=|>]$/.test(trimmed)) {
    return true;
  }
  // Multi-column short names: `初一/  初三/  初二/`
  if (/^\S+(?:\s+\S+){0,20}$/.test(trimmed) && !trimmed.includes("=")) {
    return true;
  }
  return false;
}

/** True when this buffer line is output from a recent `ls` (not login text, prompts, etc.). */
export function isLineInLsOutput(
  getLinePlain: (lineNumber: number) => string | null,
  lineNumber: number,
): boolean {
  if (lineNumber < 1) return false;

  const currentLine = getLinePlain(lineNumber);
  if (currentLine) {
    const trimmed = stripAnsi(currentLine).trim();
    if (/^Last login:/i.test(trimmed)) return false;
    if (isLikelyShellPromptLine(currentLine) && hasPromptTerminator(trimmed)) {
      return false;
    }
  }

  for (let i = lineNumber - 1; i >= 1; i -= 1) {
    const plain = getLinePlain(i);
    if (!plain) continue;

    if (isLikelyShellPromptLine(plain)) {
      const cmd = extractCommandFromPromptRegion(getLinePlain, i, lineNumber);
      return isLsCommand(cmd);
    }

    // Command wrapped onto its own row (no prompt prefix on this buffer line).
    if (isLsCommandLine(plain)) {
      return true;
    }
  }

  return false;
}

function parseCdLsTargetFromCommand(command: string): string | null {
  const match = command.trim().match(/^cd\s+(.+?)\s*(?:&&|;)\s*ls\b/i);
  if (!match) {
    return null;
  }
  return unquoteShellWord(match[1]);
}

function resolveCdTarget(target: string, promptCwd: string): string {
  if (target === "~" || target.startsWith("~/") || target.startsWith("/")) {
    return target;
  }
  return joinRemotePath(promptCwd, target);
}

function parseCdTarget(command: string): string | null {
  const cdOnly = command.trim().match(/^cd\s+(.+)$/i);
  if (!cdOnly?.[1]) {
    return null;
  }
  return unquoteShellWord(cdOnly[1]);
}

/** Replay visible `cd` commands to recover cwd at a buffer line (local/zsh prompts). */
export function replayCwdAtLine(
  getLinePlain: (lineNumber: number) => string | null,
  beforeLine: number,
  initialCwd = "~",
): string {
  let cwd = initialCwd;
  for (let i = 1; i < beforeLine; i += 1) {
    const plain = getLinePlain(i);
    if (!plain || !isLikelyShellPromptLine(plain)) {
      continue;
    }

    const { plain: assembled } = assemblePromptRegion(
      getLinePlain,
      i,
      beforeLine,
    );
    const command = extractCommandFromPromptRegion(getLinePlain, i, beforeLine);
    const cdLs = parseCdLsTargetFromCommand(command);
    if (cdLs) {
      cwd = resolveCdTarget(cdLs, cwd);
      continue;
    }

    const cdTarget = parseCdTarget(command);
    if (cdTarget) {
      cwd = resolveCdTarget(cdTarget, cwd);
      continue;
    }

    const promptCwd = parsePromptCwd(assembled);
    if (promptCwd) {
      cwd = promptCwd;
    }
  }
  return cwd;
}

function findListingParentFromCommands(
  getLinePlain: (lineNumber: number) => string | null,
  lineNumber: number,
  initialCwd = "~",
): string | null {
  for (let i = lineNumber - 1; i >= 1; i -= 1) {
    const plain = getLinePlain(i);
    if (!plain || !isLikelyShellPromptLine(plain)) {
      continue;
    }

    const cwdBefore = replayCwdAtLine(getLinePlain, i, initialCwd);
    const { plain: assembled } = assemblePromptRegion(
      getLinePlain,
      i,
      lineNumber,
    );
    const command = extractCommandFromPromptRegion(getLinePlain, i, lineNumber);
    const cdTarget = parseCdLsTargetFromCommand(command);
    if (cdTarget) {
      return resolveCdTarget(cdTarget, cwdBefore);
    }

    if (/^ls(\s|$)/.test(command.trim())) {
      const promptCwd = parsePromptCwd(assembled);
      return promptCwd ?? cwdBefore;
    }
  }

  return null;
}

export function getListingParentDir(
  getLinePlain: (lineNumber: number) => string | null,
  _totalLines: number,
  lineNumber: number,
  _clickedName: string,
  initialCwd = "~",
): string | null {
  const fromCommand = findListingParentFromCommands(
    getLinePlain,
    lineNumber,
    initialCwd,
  );
  if (fromCommand) {
    return fromCommand;
  }

  for (let i = lineNumber - 1; i >= 1; i -= 1) {
    const plain = getLinePlain(i);
    if (!plain || !isLikelyShellPromptLine(plain)) {
      continue;
    }
    const { plain: assembled } = assemblePromptRegion(
      getLinePlain,
      i,
      lineNumber,
    );
    const promptCwd = parsePromptCwd(assembled);
    if (promptCwd) {
      return promptCwd;
    }
  }

  return replayCwdAtLine(getLinePlain, lineNumber, initialCwd);
}

export function resolvePathFromListing(
  getLinePlain: (lineNumber: number) => string | null,
  totalLines: number,
  lineNumber: number,
  clickedName: string,
): string {
  if (
    clickedName.startsWith("/") ||
    clickedName.startsWith("~/") ||
    clickedName === "~"
  ) {
    return clickedName.replace(/[$#]+$/, "");
  }

  const cleanName = clickedName
    .replace(/[$#]+$/, "")
    .replace(/\/$/, "")
    .replace(/[@*=|>]$/, "");

  const parent = getListingParentDir(
    getLinePlain,
    totalLines,
    lineNumber,
    cleanName,
  );
  if (!parent) return cleanName;
  return joinRemotePath(parent, cleanName);
}

export function getLinePlainText(
  getLine: (lineNumber: number) => { length: number; getCell: (col: number) => { getChars: () => string; getWidth: () => number } | undefined | null } | undefined | null,
  lineNumber: number,
): string | null {
  const line = getLine(lineNumber);
  if (!line) return null;
  return buildLineColumnMap(line).plain;
}

/**
 * Read cwd from the newest prompt lines in an xterm buffer (what the user sees).
 * Prefer this over SSH exec `pwd`, which runs on a new channel and stays at $HOME.
 */
export function readTerminalPromptCwd(terminal: {
  buffer: {
    active: {
      baseY: number;
      cursorY: number;
      getLine: (y: number) =>
        | {
            length: number;
            getCell: (col: number) =>
              | { getChars: () => string; getWidth: () => number }
              | undefined
              | null;
          }
        | undefined
        | null;
    };
  };
}): string | null {
  const buf = terminal.buffer.active;
  const cursorLine = buf.baseY + buf.cursorY;
  const start = Math.max(0, cursorLine - 12);
  const getLinePlain = (lineNumber: number) =>
    getLinePlainText((n) => buf.getLine(n - 1), lineNumber);

  for (let y = cursorLine; y >= start; y -= 1) {
    const line = buf.getLine(y);
    if (!line) continue;
    const oneBased = y + 1;
    if (!isLikelyShellPromptLine(buildLineColumnMap(line).plain)) continue;
    const { plain } = assemblePromptRegion(
      getLinePlain,
      oneBased,
      cursorLine + 2,
    );
    const cwd = parsePromptCwd(plain);
    if (cwd) return cwd.replace(/\/+$/, "") || cwd;
  }
  return null;
}

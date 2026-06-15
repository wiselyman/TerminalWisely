import { buildLineColumnMap, stripAnsi } from "./terminalLinks";

export function parsePromptCwd(line: string): string | null {
  const plain = stripAnsi(line).trim();
  // SSH / bash: user@host:~/path$
  const colonMatch = plain.match(/:(~(?:\/[^\s$#%]*)?|\/[^\s$#%]*)[\s$#%]/);
  if (colonMatch?.[1]) {
    return colonMatch[1];
  }
  // zsh: ~/path %  or  /abs/path %
  const zshMatch = plain.match(
    /(?:^|\s)(~(?:\/[^\s%#]*)?|\/[^\s%#]*)\s*[%#](?:\s|$)/,
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

  // cd ~/'下载' or /'My Dir' — strip quotes around individual path segments
  result = result.replace(/\/'([^']*)'/g, "/$1");
  result = result.replace(/\/"([^"]*)"/g, "/$1");
  result = result.replace(/^~\/'([^']*)'/, "~/$1");
  result = result.replace(/^~\/"([^"]*)"/, "~/$1");

  return result;
}

function extractCommandLine(line: string): string {
  const plain = stripAnsi(line).trim();
  const afterPrompt = plain.match(
    /:(~(?:\/[^\s$#]*)?|\/[^\s$#]*)\s*[$#]\s*(.+)$/,
  );
  if (afterPrompt?.[2]?.trim()) {
    return afterPrompt[2].trim();
  }
  return plain;
}

function parseCdLsTarget(line: string): string | null {
  const command = extractCommandLine(line);
  const match = command.match(/^cd\s+(.+?)\s*(?:&&|;)\s*ls\b/i);
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
  const cdOnly = command.match(/^cd\s+(.+)$/i);
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
    if (!plain) {
      continue;
    }

    const cdLs = parseCdLsTarget(plain);
    if (cdLs) {
      cwd = resolveCdTarget(cdLs, cwd);
      continue;
    }

    const cdTarget = parseCdTarget(extractCommandLine(plain));
    if (cdTarget) {
      cwd = resolveCdTarget(cdTarget, cwd);
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
    if (!plain) {
      continue;
    }

    const cwdBefore = replayCwdAtLine(getLinePlain, i, initialCwd);

    const cdTarget = parseCdLsTarget(plain);
    if (cdTarget) {
      return resolveCdTarget(cdTarget, cwdBefore);
    }

    const command = extractCommandLine(plain);
    if (/^ls(\s|$)/.test(command)) {
      return cwdBefore;
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

  const cleanName = clickedName.replace(/[$#]+$/, "").replace(/\/$/, "");

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

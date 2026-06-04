import { buildLineColumnMap, stripAnsi } from "./terminalLinks";

export function parsePromptCwd(line: string): string | null {
  const plain = stripAnsi(line).trim();
  // Allow trailing commands on the same line, e.g. "(base) user@host:~$ ls"
  const match = plain.match(/:(~(?:\/[^\s$#]*)?|\/[^\s$#]*)\s*[$#]/);
  return match?.[1] ?? null;
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

function unquoteShellWord(word: string): string {
  const trimmed = word.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
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

function findPromptAbove(
  getLinePlain: (lineNumber: number) => string | null,
  beforeLine: number,
): string | null {
  for (let i = beforeLine; i >= 1; i -= 1) {
    const plain = getLinePlain(i);
    if (!plain) {
      continue;
    }
    const cwd = parsePromptCwd(plain);
    if (cwd) {
      return cwd;
    }
  }
  return null;
}

function promptCwdForLine(
  getLinePlain: (lineNumber: number) => string | null,
  lineNumber: number,
): string {
  const plain = getLinePlain(lineNumber);
  if (plain) {
    const sameLine = parsePromptCwd(plain);
    if (sameLine) {
      return sameLine;
    }
  }
  return findPromptAbove(getLinePlain, lineNumber - 1) ?? "~";
}

function findListingParentFromCommands(
  getLinePlain: (lineNumber: number) => string | null,
  lineNumber: number,
): string | null {
  for (let i = lineNumber - 1; i >= 1; i -= 1) {
    const plain = getLinePlain(i);
    if (!plain) {
      continue;
    }

    const cdTarget = parseCdLsTarget(plain);
    if (cdTarget) {
      return resolveCdTarget(cdTarget, promptCwdForLine(getLinePlain, i));
    }

    const command = extractCommandLine(plain);
    if (/^ls(\s|$)/.test(command)) {
      return promptCwdForLine(getLinePlain, i);
    }
  }

  return null;
}

export function getListingParentDir(
  getLinePlain: (lineNumber: number) => string | null,
  _totalLines: number,
  lineNumber: number,
  _clickedName: string,
): string | null {
  const fromCommand = findListingParentFromCommands(getLinePlain, lineNumber);
  if (fromCommand) {
    return fromCommand;
  }

  return findPromptAbove(getLinePlain, lineNumber - 1);
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

  const cleanName = clickedName.replace(/[$#]+$/, "");

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

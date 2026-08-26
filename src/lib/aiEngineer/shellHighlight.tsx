/** Lightweight shell highlighter for Cursor-like exec cards. */

import type { ReactNode } from "react";

const KEYWORDS = new Set([
  "cd",
  "ls",
  "pwd",
  "cat",
  "head",
  "tail",
  "grep",
  "find",
  "echo",
  "printf",
  "export",
  "unset",
  "source",
  "sudo",
  "ssh",
  "scp",
  "curl",
  "wget",
  "python",
  "python3",
  "pip",
  "npx",
  "npm",
  "node",
  "cargo",
  "rustc",
  "git",
  "docker",
  "kubectl",
  "nvidia-smi",
  "last",
  "lastb",
  "systemctl",
  "journalctl",
  "apt",
  "apt-get",
  "yum",
  "dnf",
  "brew",
  "chmod",
  "chown",
  "mkdir",
  "rm",
  "cp",
  "mv",
  "ln",
  "ps",
  "kill",
  "top",
  "htop",
  "df",
  "du",
  "free",
  "uname",
  "which",
  "type",
  "command",
  "test",
  "true",
  "false",
  "exit",
  "return",
  "for",
  "while",
  "until",
  "do",
  "done",
  "if",
  "then",
  "elif",
  "else",
  "fi",
  "case",
  "esac",
  "in",
  "select",
  "function",
  "time",
  "trap",
  "wait",
  "read",
  "set",
  "shift",
  "local",
  "declare",
  "typeset",
  "alias",
  "unalias",
  "basename",
  "dirname",
  "xargs",
  "awk",
  "sed",
  "sort",
  "uniq",
  "wc",
  "tr",
  "cut",
  "tee",
  "tar",
  "gzip",
  "gunzip",
  "zip",
  "unzip",
  "mount",
  "umount",
  "ping",
  "ip",
  "ifconfig",
  "ss",
  "netstat",
  "lsof",
  "openssl",
  "jq",
  "rg",
  "fd",
  "bat",
  "tmux",
  "screen",
  "make",
  "cmake",
  "gcc",
  "clang",
  "go",
  "ruby",
  "perl",
  "php",
  "java",
  "javac",
  "mvn",
  "gradle",
  "conda",
  "poetry",
  "uv",
  "pytest",
  "tsc",
  "vite",
  "webpack",
  "yarn",
  "pnpm",
]);

type TokKind = "kw" | "flag" | "str" | "op" | "text";

function pushTok(out: { kind: TokKind; text: string }[], kind: TokKind, text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.kind === kind) last.text += text;
  else out.push({ kind, text });
}

function tokenizeShell(src: string): { kind: TokKind; text: string }[] {
  const out: { kind: TokKind; text: string }[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;

    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\" && quote === '"') {
          j += 2;
          continue;
        }
        if (src[j] === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      pushTok(out, "str", src.slice(i, j));
      i = j;
      continue;
    }

    if (ch === "#" && (i === 0 || /\s/.test(src[i - 1]!))) {
      let j = i + 1;
      while (j < src.length && src[j] !== "\n") j += 1;
      pushTok(out, "text", src.slice(i, j));
      i = j;
      continue;
    }

    if ("|&;<>(){}".includes(ch) || (ch === "$" && src[i + 1] === "(")) {
      if (ch === "$" && src[i + 1] === "(") {
        let j = i + 2;
        let depth = 1;
        while (j < src.length && depth > 0) {
          if (src[j] === "(") depth += 1;
          else if (src[j] === ")") depth -= 1;
          j += 1;
        }
        pushTok(out, "op", src.slice(i, j));
        i = j;
        continue;
      }
      let j = i + 1;
      if ((ch === "|" || ch === "&" || ch === ">" || ch === "<") && src[j] === ch) j += 1;
      if (ch === ">" && src[j] === "&") j += 1;
      pushTok(out, "op", src.slice(i, j));
      i = j;
      continue;
    }

    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j]!)) j += 1;
      pushTok(out, "text", src.slice(i, j));
      i = j;
      continue;
    }

    let j = i + 1;
    while (j < src.length && !/\s/.test(src[j]!) && !"|&;<>(){}#'\"".includes(src[j]!)) {
      j += 1;
    }
    const word = src.slice(i, j);
    if (word.startsWith("-") && word.length > 1) pushTok(out, "flag", word);
    else if (KEYWORDS.has(word)) pushTok(out, "kw", word);
    else pushTok(out, "text", word);
    i = j;
  }
  return out;
}

export function highlightShell(command: string): ReactNode[] {
  return tokenizeShell(command).map((tok, idx) => (
    <span key={idx} className={`ai-shell-tok is-${tok.kind}`}>
      {tok.text}
    </span>
  ));
}

/** Cursor-style right-side tool chips: first few external commands. */
export function summarizeShellTools(command: string, limit = 4): string[] {
  const tools: string[] = [];
  const seen = new Set<string>();
  for (const tok of tokenizeShell(command)) {
    if (tok.kind !== "kw") continue;
    if (["do", "done", "if", "then", "elif", "else", "fi", "for", "while", "until", "case", "esac", "in", "function", "time", "local", "declare", "typeset", "export", "set", "shift", "return", "exit", "true", "false", "test", "command", "type", "alias", "unalias", "source", "wait", "trap", "select"].includes(tok.text)) {
      continue;
    }
    if (seen.has(tok.text)) continue;
    seen.add(tok.text);
    tools.push(tok.text);
    if (tools.length >= limit) break;
  }
  return tools;
}

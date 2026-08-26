"""Quote-aware shell leaf splitting and argv peel (sudo / xargs)."""

from __future__ import annotations

import re
import shlex
from dataclasses import dataclass


@dataclass(frozen=True)
class Leaf:
    raw: str
    argv: list[str]
    binary: str | None


def split_outside_quotes(command: str, delimiters: tuple[str, ...]) -> list[str]:
    """Split on delimiters outside quotes/parens, keeping for/if/while compounds intact."""
    parts: list[str] = []
    buf: list[str] = []
    i = 0
    n = len(command)
    quote: str | None = None
    loop_depth = 0
    if_depth = 0
    case_depth = 0
    paren_depth = 0
    delims = sorted(delimiters, key=len, reverse=True)

    def _at_word(word: str) -> bool:
        if not command.startswith(word, i):
            return False
        end = i + len(word)
        if end < n and (command[end].isalnum() or command[end] == "_"):
            return False
        if i > 0 and (command[i - 1].isalnum() or command[i - 1] == "_"):
            return False
        return True

    while i < n:
        ch = command[i]
        if quote:
            buf.append(ch)
            if ch == quote and (i == 0 or command[i - 1] != "\\"):
                quote = None
            i += 1
            continue
        if ch in "'\"":
            quote = ch
            buf.append(ch)
            i += 1
            continue

        if ch == "(":
            paren_depth += 1
            buf.append(ch)
            i += 1
            continue
        if ch == ")" and paren_depth > 0:
            paren_depth -= 1
            buf.append(ch)
            i += 1
            continue

        if _at_word("for") or _at_word("while") or _at_word("until"):
            loop_depth += 1
        elif _at_word("done") and loop_depth > 0:
            loop_depth -= 1
        elif _at_word("if"):
            if_depth += 1
        elif _at_word("fi") and if_depth > 0:
            if_depth -= 1
        elif _at_word("case"):
            case_depth += 1
        elif _at_word("esac") and case_depth > 0:
            case_depth -= 1

        in_compound = loop_depth > 0 or if_depth > 0 or case_depth > 0 or paren_depth > 0
        matched = None
        if not in_compound:
            for d in delims:
                if command.startswith(d, i):
                    matched = d
                    break
        if matched is not None:
            part = "".join(buf).strip()
            if part:
                parts.append(part)
            buf = []
            i += len(matched)
            continue
        buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        parts.append(tail)
    return parts or ([command.strip()] if command.strip() else [])


def unwrap_subshell(command: str) -> str:
    cmd = command.strip()
    while cmd.startswith("(") and cmd.endswith(")") and len(cmd) >= 2:
        depth = 0
        balanced = True
        for i, ch in enumerate(cmd):
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0 and i != len(cmd) - 1:
                    balanced = False
                    break
                if depth < 0:
                    balanced = False
                    break
        if not balanced or depth != 0:
            break
        cmd = cmd[1:-1].strip()
    return cmd


def tokenize(command: str) -> list[str]:
    try:
        return shlex.split(command.strip(), posix=True)
    except ValueError:
        return command.strip().split()


def peel_sudo_argv(argv: list[str]) -> list[str] | None:
    if not argv:
        return None
    name = argv[0].rsplit("/", 1)[-1].lower()
    if name != "sudo":
        return None
    i = 1
    takes_value = {
        "-u", "-g", "-h", "-p", "-C", "-D", "-R", "-T",
        "--user", "--group", "--host", "--prompt", "--close-from",
        "--chdir", "--chroot", "--command-timeout",
    }
    while i < len(argv):
        tok = argv[i]
        if tok == "--":
            i += 1
            break
        if not tok.startswith("-") or tok in {"-", "--"}:
            break
        bare = tok.split("=", 1)[0]
        if bare in takes_value and "=" not in tok:
            i += 2
            continue
        i += 1
    return argv[i:]


def peel_xargs_argv(argv: list[str]) -> list[str] | None:
    if not argv:
        return None
    name = argv[0].rsplit("/", 1)[-1].lower()
    if name != "xargs":
        return None
    i = 1
    takes_value = {
        "-n", "-P", "-I", "-L", "-s", "-E", "-a", "-d",
        "--max-args", "--max-procs", "--replace", "--max-lines",
        "--max-chars", "--eof", "--arg-file", "--delimiter",
    }
    while i < len(argv):
        tok = argv[i]
        if tok == "--":
            i += 1
            break
        if not tok.startswith("-") or tok == "-":
            break
        bare = tok.split("=", 1)[0]
        if len(bare) >= 3 and bare[1] in "nPLsEadI" and not bare.startswith("--"):
            i += 1
            continue
        if bare in takes_value and "=" not in tok:
            i += 2
            continue
        i += 1
    if i >= len(argv):
        return None
    return argv[i:]


def normalize_argv(command: str) -> list[str]:
    """Peel sudo/xargs wrappers; return effective argv."""
    raw = unwrap_subshell(command.strip())
    argv = tokenize(raw)
    while True:
        if not argv:
            return []
        peeled = peel_sudo_argv(argv)
        if peeled is not None:
            argv = peeled
            continue
        name = argv[0].rsplit("/", 1)[-1].lower()
        if name == "xargs":
            inner = peel_xargs_argv(argv)
            if inner is None:
                return argv
            argv = inner
            continue
        break
    # Drop VAR=value prefixes
    i = 0
    while i < len(argv) and "=" in argv[i] and not argv[i].startswith("-"):
        i += 1
    return argv[i:]


_SHELL_KEYWORDS = frozenset(
    {
        "for", "do", "done", "if", "then", "fi", "else", "elif", "while", "until",
        "case", "esac", "in", "select", "time", "function", "coproc", "{", "}",
        "!", "[[", "]]",
    }
)


def iter_leaves(command: str) -> list[Leaf]:
    cmd = command.strip()
    if not cmd:
        return []
    leaves: list[Leaf] = []
    for seg in split_outside_quotes(cmd, ("&&", "||", ";", "\n")):
        for stage in split_outside_quotes(seg, ("|",)):
            raw = unwrap_subshell(stage.strip())
            if not raw:
                continue
            argv = normalize_argv(raw)
            binary = None
            if argv:
                binary = argv[0].rsplit("/", 1)[-1].lower()
            leaves.append(Leaf(raw=raw, argv=argv, binary=binary))
    return leaves


def is_flag_only_probe(argv: list[str], raw: str) -> bool:
    """True when argv is binary + dash-flags only (plus harmless redirects)."""
    cleaned = re.sub(r"(?:^|\s)\d*(?:>>?|&>>?)\s*/dev/null\b", " ", raw, flags=re.I)
    cleaned = re.sub(r"(?:^|\s)\d*>&\d+\b", " ", cleaned)
    tokens = tokenize(cleaned)
    i = 0
    while i < len(tokens) and "=" in tokens[i] and not tokens[i].startswith("-"):
        i += 1
    # peel sudo for probe check on original-ish tokens
    peeled = peel_sudo_argv(tokens[i:]) if i < len(tokens) else None
    use = peeled if peeled is not None else tokens[i:]
    if not use:
        return False
    for tok in use[1:]:
        if tok in {">", ">>", "<"}:
            continue
        if re.fullmatch(r"\d*>&\d+", tok) or re.fullmatch(r"\d*>/dev/null", tok, re.I):
            continue
        if tok.startswith("2>") or tok == "/dev/null":
            continue
        if not tok.startswith("-"):
            return False
    return True


def has_file_redirect(argv: list[str], raw: str) -> bool:
    """True for real file redirects; ignores 2>/dev/null, >/dev/null, 2>&1."""
    if re.search(r"(?<![0-9])>{1,2}\s*(?!&|/dev/null\b)", raw, re.I):
        return True
    binary = argv[0].rsplit("/", 1)[-1].lower() if argv else ""
    if binary == "tee":
        return True
    if binary == "sed" and any(t == "-i" or t.startswith("-i") for t in argv[1:]):
        return True
    return False


def is_shell_keyword(binary: str | None) -> bool:
    return binary in _SHELL_KEYWORDS if binary else False

"""Keep terminal_exec `command` as executable shell — titles belong in `intent`."""

from __future__ import annotations

import re

# echo whose entire quoted/unquoted payload is a section banner (===…=== / ---…---)
_BANNER_PAYLOAD = re.compile(
    r"""^\s*(?:-e\s+)?(?P<q>['"])(?P<body>.*?)\1\s*$""",
    re.IGNORECASE | re.DOTALL,
)
_BANNER_BODY = re.compile(
    r"""^\s*[=─\-_*]{2,}[^=─\-_*].*[=─\-_*]{2,}\s*$"""
    r"""|^\s*[=─\-_*]{3,}\s*$""",
)
_EMPTY_ECHO = re.compile(
    r"""^\s*echo\s+(?:-e\s+)?(?:(['"])\s*\1)?\s*$""",
    re.IGNORECASE,
)
_COMMENT_LINE = re.compile(r"^\s*#")
_BLANK = re.compile(r"^\s*$")
_ECHO_CMD = re.compile(r"^\s*echo\b", re.IGNORECASE)


def extract_command_title(command: str) -> str:
    """First `# …` comment line, stripped — for UI title when intent is missing."""
    for line in (command or "").splitlines():
        if _BLANK.match(line):
            continue
        if _COMMENT_LINE.match(line):
            return line.lstrip()[1:].strip()
        break
    return ""


def _is_decorative_echo_statement(stmt: str) -> bool:
    s = (stmt or "").strip()
    if not s or not _ECHO_CMD.match(s):
        return False
    if _EMPTY_ECHO.match(s):
        return True
    # echo …args
    rest = s[s.lower().find("echo") + 4 :].strip()
    if not rest:
        return True
    m = _BANNER_PAYLOAD.match(rest)
    if m:
        return bool(_BANNER_BODY.match(m.group("body") or ""))
    # unquoted: echo === foo ===
    if _BANNER_BODY.match(rest):
        return True
    return False


def _split_shell_statements(script: str) -> list[tuple[str, str]]:
    """Split on top-level `;` / `&&` / `||`, respecting quotes and escapes.

    Returns list of (statement, trailing_separator) where trailing_separator is
    '', ';', '&&', or '||' (whitespace preserved on the separator side minimally).
    """
    text = script or ""
    parts: list[tuple[str, str]] = []
    buf: list[str] = []
    i = 0
    n = len(text)
    quote = ""
    while i < n:
        ch = text[i]
        if quote:
            buf.append(ch)
            if ch == "\\" and i + 1 < n and quote == '"':
                buf.append(text[i + 1])
                i += 2
                continue
            if ch == quote:
                quote = ""
            i += 1
            continue
        if ch in ("'", '"'):
            quote = ch
            buf.append(ch)
            i += 1
            continue
        # top-level separators
        if ch == ";" and not (i + 1 < n and text[i + 1] == ";"):
            parts.append(("".join(buf), ";"))
            buf = []
            i += 1
            continue
        if text.startswith("&&", i):
            parts.append(("".join(buf), "&&"))
            buf = []
            i += 2
            continue
        if text.startswith("||", i):
            parts.append(("".join(buf), "||"))
            buf = []
            i += 2
            continue
        buf.append(ch)
        i += 1
    parts.append(("".join(buf), ""))
    return parts


def _sanitize_line_statements(line: str) -> str:
    """Drop decorative echo statements inside one physical line."""
    chunks = _split_shell_statements(line)
    kept: list[tuple[str, str]] = []
    for stmt, sep in chunks:
        if _is_decorative_echo_statement(stmt):
            continue
        if _BLANK.match(stmt) and not stmt.strip("\t "):
            # pure whitespace statement — skip
            continue
        kept.append((stmt, sep))
    if not kept:
        return ""
    # Rebuild with readable separators
    out: list[str] = []
    for idx, (stmt, sep) in enumerate(kept):
        out.append(stmt.rstrip() if idx == 0 else stmt.strip())
        if idx < len(kept) - 1:
            joiner = sep if sep else ";"
            if joiner == ";":
                out.append("; ")
            else:
                out.append(f" {joiner} ")
    return "".join(out).strip()


def first_executable_statement(command: str) -> str:
    """First non-decorative statement after sanitization — for intent fallback."""
    clean = sanitize_terminal_command(command or "")
    if not clean:
        return ""
    flattened = clean.replace("\n", "; ")
    for stmt, _sep in _split_shell_statements(flattened):
        s = re.sub(r"\s+", " ", stmt).strip()
        if s and not _is_decorative_echo_statement(s):
            return s
    return re.sub(r"\s+", " ", clean).strip()


def sanitize_terminal_command(command: str) -> str:
    """Drop title comments and banner `echo ===…===` / `echo ---…---` statements.

    Works for newline-separated scripts and `;` / `&&` / `||` chains.
    Real echo/printf that print useful data are kept.
    """
    lines = (command or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out: list[str] = []
    leading = True
    for line in lines:
        if leading and _BLANK.match(line):
            continue
        if leading and _COMMENT_LINE.match(line):
            continue
        leading = False
        cleaned = _sanitize_line_statements(line)
        if not cleaned:
            continue
        if _BLANK.match(cleaned) and (not out or _BLANK.match(out[-1])):
            continue
        out.append(cleaned)
    while out and _BLANK.match(out[-1]):
        out.pop()
    return "\n".join(out).strip()

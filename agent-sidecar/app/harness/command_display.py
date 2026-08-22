"""Keep terminal_exec `command` as executable shell — titles belong in `intent`."""

from __future__ import annotations

import re

_DECORATIVE_ECHO = re.compile(
    r"""^\s*echo\s+(?:-e\s+)?(['"])\s*=+[^=]*?=+\s*\1\s*$""",
    re.IGNORECASE,
)
_EMPTY_ECHO = re.compile(
    r"""^\s*echo\s+(?:-e\s+)?(['"])\s*\1\s*$""",
    re.IGNORECASE,
)
_COMMENT_LINE = re.compile(r"^\s*#")
_BLANK = re.compile(r"^\s*$")


def extract_command_title(command: str) -> str:
    """First `# …` comment line, stripped — for UI title when intent is missing."""
    for line in (command or "").splitlines():
        if _BLANK.match(line):
            continue
        if _COMMENT_LINE.match(line):
            return line.lstrip()[1:].strip()
        break
    return ""


def sanitize_terminal_command(command: str) -> str:
    """Drop title comments and banner `echo ===…===` lines from the shell script.

    Real echo/printf that print useful data are kept. Only lines whose entire
    payload is a decorative `=== … ===` banner (or empty echo) are removed.
    """
    lines = (command or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out: list[str] = []
    leading = True
    for line in lines:
        if leading and _BLANK.match(line):
            continue
        if leading and _COMMENT_LINE.match(line):
            # Skip one or more leading comment-only title lines.
            continue
        leading = False
        if _DECORATIVE_ECHO.match(line) or _EMPTY_ECHO.match(line):
            continue
        # Also drop blank lines that only separated banners/comments.
        if _BLANK.match(line) and (not out or _BLANK.match(out[-1])):
            continue
        out.append(line)
    # Trim trailing blanks
    while out and _BLANK.match(out[-1]):
        out.pop()
    return "\n".join(out).strip()

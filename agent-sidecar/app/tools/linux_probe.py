"""Read-only Linux probe tools — all commands still pass PolicyEngine + Broker."""

from __future__ import annotations

import re
import shlex

TOOL_SERVICE_STATUS = "service_status"
TOOL_LIST_LISTENERS = "list_listeners"
TOOL_GREP_REMOTE_LOGS = "grep_remote_logs"
TOOL_READ_REMOTE_FILE = "read_remote_file"

_SAFE_UNIT = re.compile(r"^[A-Za-z0-9@._:-]+$")


def is_safe_remote_path(path: str) -> bool:
    """Absolute path OK for shlex.quote; Unicode names allowed, no .. / controls."""
    p = (path or "").strip()
    if not p.startswith("/") or "\0" in p:
        return False
    if any(ord(c) < 32 or ord(c) == 127 for c in p):
        return False
    if ".." in p.split("/"):
        return False
    return True


def build_service_status_command(unit: str, *, full: bool = False) -> str | None:
    name = (unit or "").strip()
    if not name or not _SAFE_UNIT.match(name):
        return None
    if full:
        return f"systemctl status {shlex.quote(name)} --no-pager -l"
    return (
        f"systemctl is-active {shlex.quote(name)} ; "
        f"systemctl show {shlex.quote(name)} -p ActiveState,SubState,MainPID --no-pager"
    )


def build_list_listeners_command() -> str:
    return "ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null || ss -tuln"


def build_grep_logs_command(
    *,
    unit: str = "",
    pattern: str = "",
    since: str = "1 hour ago",
    lines: int = 80,
) -> str | None:
    pat = (pattern or "").strip()
    if not pat:
        return None
    safe_pat = shlex.quote(pat)
    safe_since = shlex.quote((since or "1 hour ago").strip() or "1 hour ago")
    n = max(10, min(int(lines or 80), 400))
    if unit and _SAFE_UNIT.match(unit.strip()):
        u = shlex.quote(unit.strip())
        return (
            f"journalctl -u {u} --since {safe_since} --no-pager -n {n} | "
            f"grep -E -- {safe_pat} || true"
        )
    return f"journalctl --since {safe_since} --no-pager -n {n} | grep -E -- {safe_pat} || true"


def build_read_remote_file_command(
    path: str,
    *,
    offset: int = 0,
    limit: int = 200,
) -> str | None:
    p = (path or "").strip()
    if not p or not is_safe_remote_path(p):
        return None
    quoted = shlex.quote(p)
    lim = max(1, min(int(limit or 200), 500))
    off = max(0, int(offset or 0))
    if off > 0:
        return f"sed -n '{off + 1},{off + lim}p' {quoted}"
    return f"head -n {lim} {quoted}"

"""Backup / restore shell command builders (executed via terminal_exec on host)."""

from __future__ import annotations

import shlex


def backup_commands(path: str, backup_root: str = "/tmp/tw-ai-backup") -> list[str]:
    p = shlex.quote(path)
    root = shlex.quote(backup_root)
    return [
        f"mkdir -p {root}",
        f"cp -a {p} {root}/$(basename {p}).$(date +%s).bak",
    ]


def restore_command(path: str, backup_file: str) -> str:
    return f"cp -a {shlex.quote(backup_file)} {shlex.quote(path)}"


def validate_commands_for_path(path: str) -> list[str]:
    """Best-effort validators by path heuristic."""
    if "nginx" in path:
        return ["nginx -t"]
    if "sshd" in path or path.endswith("sshd_config"):
        return ["sshd -t"]
    if path.endswith(".service"):
        return [f"systemd-analyze verify {shlex.quote(path)}"]
    return [f"test -e {shlex.quote(path)}"]

"""Canonical argv for approval-cache keys (Codex-style peel bash -lc)."""

from __future__ import annotations

import re
import shlex


_SHELL_WRAPPER_RE = re.compile(
    r"^(?:/usr/bin/)?(?:env\s+-i\s+)?(?:/bin/)?(bash|sh|dash|zsh)\s+(-lc|-c)\s+",
    re.IGNORECASE,
)


def canonicalize_command_for_approval(command: str) -> str:
    """Normalize a shell command string for session approval cache keys."""
    cmd = (command or "").strip()
    if not cmd:
        return ""
    try:
        parts = shlex.split(cmd)
    except ValueError:
        return cmd
    if len(parts) >= 3 and parts[1] in {"-lc", "-c"}:
        shell = parts[0].lower()
        if shell.endswith(("bash", "sh", "dash", "zsh")) or shell in {"bash", "sh", "dash", "zsh"}:
            inner = parts[2]
            if len(parts) > 3:
                inner = " ".join(parts[2:])
            return f"__shell_script__:{inner.strip()}"
    return " ".join(parts)

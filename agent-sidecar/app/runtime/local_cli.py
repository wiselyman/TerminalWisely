"""Resolve and probe locally installed agent CLIs (Cursor / Codex / Claude)."""

from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from typing import Any, Literal

LocalCliKind = Literal["cursor", "codex", "claude"]

INSTALL_URLS: dict[str, str] = {
    "cursor": "https://cursor.com/download",
    "codex": "https://github.com/openai/codex",
    "claude": "https://claude.ai/code",
}


@dataclass(frozen=True)
class ResolvedCli:
    kind: LocalCliKind
    """Executable path (absolute when possible)."""
    binary: str
    """Argv prefix before prompt flags, e.g. ['cursor-agent'] or ['cursor', 'agent']."""
    argv_prefix: list[str]


def _which(name: str) -> str | None:
    found = shutil.which(name)
    return found


def resolve_cursor_cli() -> ResolvedCli | None:
    agent = _which("cursor-agent")
    if agent:
        return ResolvedCli(kind="cursor", binary=agent, argv_prefix=[agent])
    cursor = _which("cursor")
    if cursor:
        return ResolvedCli(
            kind="cursor", binary=cursor, argv_prefix=[cursor, "agent"]
        )
    return None


def resolve_codex_cli() -> ResolvedCli | None:
    codex = _which("codex")
    if codex:
        return ResolvedCli(kind="codex", binary=codex, argv_prefix=[codex])
    return None


def resolve_claude_cli() -> ResolvedCli | None:
    claude = _which("claude")
    if claude:
        return ResolvedCli(kind="claude", binary=claude, argv_prefix=[claude])
    return None


def resolve_local_cli(kind: LocalCliKind) -> ResolvedCli | None:
    if kind == "cursor":
        return resolve_cursor_cli()
    if kind == "codex":
        return resolve_codex_cli()
    if kind == "claude":
        return resolve_claude_cli()
    return None


def explicit_fake_env(kind: LocalCliKind) -> bool:
    key = {
        "cursor": "TW_AI_CURSOR_FAKE",
        "codex": "TW_AI_CODEX_FAKE",
        "claude": "TW_AI_CLAUDE_FAKE",
    }[kind]
    flag = (os.environ.get(key) or "").strip().lower()
    return flag in {"1", "true", "yes"}


def probe_local_cli(kind: LocalCliKind) -> dict[str, Any]:
    """
    Product probe: installed = binary on PATH.
    authenticated defaults True when installed (login_unchecked) to avoid false blocks.
    fake=True only when TW_AI_*_FAKE is explicitly set.
    """
    fake = explicit_fake_env(kind)
    install_url = INSTALL_URLS.get(kind, "")
    if fake:
        return {
            "installed": True,
            "authenticated": True,
            "detail": "fake",
            "fake": True,
            "binary": "",
            "install_url": install_url,
            "code": "fake",
        }
    resolved = resolve_local_cli(kind)
    if resolved is None:
        return {
            "installed": False,
            "authenticated": False,
            "detail": "install_needed",
            "fake": False,
            "binary": "",
            "install_url": install_url,
            "code": "install_needed",
        }
    return {
        "installed": True,
        "authenticated": True,
        "detail": "login_unchecked",
        "fake": False,
        "binary": resolved.binary,
        "install_url": install_url,
        "code": "ready",
        "argv_prefix": list(resolved.argv_prefix),
    }

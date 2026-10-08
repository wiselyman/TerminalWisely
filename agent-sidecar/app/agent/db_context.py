"""Database chat context. Credentials never appear here."""

from __future__ import annotations

from typing import Any


def db_context(metadata: dict[str, Any] | None) -> dict[str, Any]:
    raw = (metadata or {}).get("db_context")
    return raw if isinstance(raw, dict) else {}


def bound_ssh_session_id(metadata: dict[str, Any] | None) -> str:
    return str(db_context(metadata).get("ssh_session_id") or "").strip()


def resolve_db_terminal_session(
    metadata: dict[str, Any] | None,
    requested: str | None,
    fallback: str | None,
) -> str | None:
    """In database mode, terminal_exec may use only the bound SSH session."""
    mode = str((metadata or {}).get("engineer_mode") or "").strip().lower()
    if mode != "db":
        return (fallback or requested or "").strip() or None
    bound = bound_ssh_session_id(metadata)
    if not bound:
        return None
    asked = str(requested or "").strip()
    if asked and asked != bound:
        return None
    return bound

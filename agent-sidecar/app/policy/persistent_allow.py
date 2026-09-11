"""Persistent user-approved command allowlist (policy overrides)."""

from __future__ import annotations

from pathlib import Path

import yaml

from app.harness.command_canonical import canonicalize_command_for_approval
from app.harness.network_guard import is_network_dangerous
from app.paths import policy_overrides_path
from app.policy.loader import _load_yaml, reload_policy


def _allowed_commands(path: Path | None = None) -> list[str]:
    p = path or policy_overrides_path()
    data = _load_yaml(p)
    raw = data.get("allowed_commands") or []
    if not isinstance(raw, list):
        return []
    return [str(x).strip() for x in raw if str(x).strip()]


def is_persistent_allow(command: str, *, security_mode: str) -> bool:
    if security_mode == "production":
        return False
    if is_network_dangerous(command):
        return False
    key = canonicalize_command_for_approval(command)
    return key in set(_allowed_commands())


def add_persistent_allow(command: str, *, security_mode: str) -> bool:
    """Append canonical command to overrides allowed_commands."""
    if security_mode == "production":
        return False
    if is_network_dangerous(command):
        return False
    key = canonicalize_command_for_approval(command)
    if not key:
        return False
    path = policy_overrides_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    data = _load_yaml(path)
    existing = set(_allowed_commands(path))
    if key in existing:
        return False
    merged = sorted(existing | {key})
    data["allowed_commands"] = merged
    path.write_text(
        yaml.safe_dump(data, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )
    reload_policy()
    return True


def overrides_allowed_commands_path() -> Path:
    return policy_overrides_path()

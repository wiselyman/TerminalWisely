"""User policy overrides — remember read-only tools from approval UI."""

from __future__ import annotations

from pathlib import Path

import yaml

from app.paths import policy_overrides_path
from app.policy.loader import _load_yaml, load_policy, reload_policy
from app.policy.parse import has_file_redirect, is_shell_keyword, iter_leaves
from app.policy.resolve import deny_floor_match, resolve_leaf


def rememberable_binaries(command: str) -> list[str]:
    """Leaf binaries safe to offer as read-only whitelist candidates."""
    bundle = load_policy()
    out: list[str] = []
    seen: set[str] = set()
    for leaf in iter_leaves(command):
        if not leaf.binary or is_shell_keyword(leaf.binary):
            continue
        caps = resolve_leaf(leaf, bundle)
        if caps - {"read", "unknown"}:
            continue
        if has_file_redirect(leaf.argv, leaf.raw):
            continue
        if deny_floor_match(leaf.raw, bundle):
            continue
        name = leaf.binary.lower()
        if name in bundle.read_binaries:
            continue
        if name not in seen:
            seen.add(name)
            out.append(name)
    return out


def add_read_binaries(binaries: list[str]) -> list[str]:
    """Append tool names to user overrides read_binaries; return names newly added."""
    wanted = sorted({b.strip().lower() for b in binaries if b and b.strip()})
    if not wanted:
        return []

    path = policy_overrides_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    data = _load_yaml(path)
    existing = {str(b).lower() for b in (data.get("read_binaries") or [])}
    added = [b for b in wanted if b not in existing]
    if not added:
        return []

    merged = sorted(existing | set(added))
    data["read_binaries"] = merged
    path.write_text(
        yaml.safe_dump(data, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )
    reload_policy()
    return added


def overrides_file_path() -> Path:
    return policy_overrides_path()

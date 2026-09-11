"""Load bundled policy YAML + optional user overrides."""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from app.paths import policy_overrides_path


def bundled_policy_dir() -> Path:
    # agent-sidecar/app/policy/loader.py → agent-sidecar/policy/
    return Path(__file__).resolve().parents[2] / "policy"


@dataclass
class PolicyBundle:
    read_binaries: frozenset[str] = field(default_factory=frozenset)
    binaries: dict[str, Any] = field(default_factory=dict)
    ranks: dict[str, str] = field(default_factory=dict)
    deny_patterns: list[str] = field(default_factory=list)


def _deep_merge_binaries(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for key, val in override.items():
        if key in out and isinstance(out[key], dict) and isinstance(val, dict):
            merged = dict(out[key])
            for sk, sv in val.items():
                if sk == "subcommands" and isinstance(merged.get(sk), dict) and isinstance(sv, dict):
                    merged[sk] = _deep_merge_binaries(merged[sk], sv)
                else:
                    merged[sk] = sv
            out[key] = merged
        else:
            out[key] = val
    return out


def _load_yaml(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        raise ValueError(f"policy file must be a mapping: {path}")
    return data


def build_bundle(
    *,
    policy_dir: Path | None = None,
    overrides_path: Path | None = None,
) -> PolicyBundle:
    root = policy_dir or bundled_policy_dir()
    caps = _load_yaml(root / "capabilities.yaml")
    matrix = _load_yaml(root / "risk_matrix.yaml")
    floor = _load_yaml(root / "deny_floor.yaml")

    ov_path = overrides_path if overrides_path is not None else policy_overrides_path()
    overrides = _load_yaml(ov_path)

    read_bins = set(caps.get("read_binaries") or [])
    binaries = dict(caps.get("binaries") or {})
    ranks = dict(matrix.get("ranks") or {})
    deny = list(floor.get("patterns") or [])

    if overrides:
        read_bins |= set(overrides.get("read_binaries") or [])
        binaries = _deep_merge_binaries(binaries, dict(overrides.get("binaries") or {}))
        ranks.update(dict(overrides.get("ranks") or {}))
        deny.extend(list(overrides.get("deny_patterns") or overrides.get("patterns") or []))

    return PolicyBundle(
        read_binaries=frozenset(str(b).lower() for b in read_bins),
        binaries={k.lower(): v for k, v in binaries.items()},
        ranks={k.lower(): str(v).upper() for k, v in ranks.items()},
        deny_patterns=deny,
    )


@lru_cache(maxsize=1)
def load_policy() -> PolicyBundle:
    return build_bundle()


def reload_policy() -> PolicyBundle:
    load_policy.cache_clear()
    return load_policy()

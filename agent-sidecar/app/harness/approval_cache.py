"""Session-scoped approval cache — skips UI only; PolicyEngine always runs."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from app.harness.command_canonical import canonicalize_command_for_approval
from app.harness.network_guard import is_network_dangerous
from app.models.approval import PrivilegeLease, TargetSessionIdentity
from app.models.terminal import RiskLevel


@dataclass
class CachedApprovalEntry:
    canonical_command: str
    exec_command: str
    risk: RiskLevel
    rollback_plan: dict[str, Any] | None = None
    stored_at: float = field(default_factory=time.time)


def identity_fingerprint(identity: TargetSessionIdentity) -> str:
    parts = [
        identity.session_id,
        identity.server_id or "",
        identity.host_fingerprint or "",
        identity.remote_user or "",
    ]
    return "|".join(parts)


def cacheable_approval(
    *,
    command: str,
    risk: RiskLevel,
    security_mode: str,
) -> bool:
    """Commands that may never use session approval cache."""
    if security_mode == "production":
        return False
    if risk.value in {"R4"}:
        return False
    if is_network_dangerous(command):
        return False
    return True


class SessionApprovalCache:
    """In-memory per-session ApprovedForSession entries."""

    def __init__(self) -> None:
        self._entries: dict[str, dict[str, CachedApprovalEntry]] = {}

    def _session_bucket(self, identity: TargetSessionIdentity) -> dict[str, CachedApprovalEntry]:
        fp = identity_fingerprint(identity)
        return self._entries.setdefault(fp, {})

    def lookup(
        self,
        identity: TargetSessionIdentity,
        command: str,
        risk: RiskLevel,
        *,
        security_mode: str,
    ) -> CachedApprovalEntry | None:
        if not cacheable_approval(command=command, risk=risk, security_mode=security_mode):
            return None
        key = canonicalize_command_for_approval(command)
        entry = self._session_bucket(identity).get(key)
        if entry is None:
            return None
        if entry.risk != risk:
            return None
        return entry

    def store(
        self,
        identity: TargetSessionIdentity,
        command: str,
        *,
        exec_command: str,
        risk: RiskLevel,
        rollback_plan: dict[str, Any] | None,
        security_mode: str,
    ) -> bool:
        if not cacheable_approval(command=command, risk=risk, security_mode=security_mode):
            return False
        key = canonicalize_command_for_approval(command)
        self._session_bucket(identity)[key] = CachedApprovalEntry(
            canonical_command=key,
            exec_command=exec_command,
            risk=risk,
            rollback_plan=rollback_plan,
        )
        return True

    def invalidate_session(self, identity: TargetSessionIdentity) -> None:
        fp = identity_fingerprint(identity)
        self._entries.pop(fp, None)

    def clear(self) -> None:
        self._entries.clear()


# Process-wide cache keyed by target session identity.
GLOBAL_APPROVAL_CACHE = SessionApprovalCache()

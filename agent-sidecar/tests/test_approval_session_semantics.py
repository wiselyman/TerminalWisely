"""Approval decision semantics: once vs session vs reject (no UI required)."""

from __future__ import annotations

from app.harness.approval_cache import GLOBAL_APPROVAL_CACHE, cacheable_approval
from app.harness.command_canonical import canonicalize_command_for_approval
from app.models.approval import TargetSessionIdentity
from app.models.terminal import RiskLevel


def _store_if_session(
    *,
    approved: bool,
    approve_for_session: bool,
    identity: TargetSessionIdentity,
    command: str,
    security_mode: str = "safe",
    risk: RiskLevel = RiskLevel.R2,
) -> bool:
    """Mirror finish_approval_wait session-cache side effect."""
    if not approved or not approve_for_session:
        return False
    if not cacheable_approval(command=command, risk=risk, security_mode=security_mode):
        return False
    return GLOBAL_APPROVAL_CACHE.store(
        identity,
        command,
        exec_command=command,
        risk=risk,
        rollback_plan=None,
        security_mode=security_mode,
    )


def test_once_does_not_store_session_cache() -> None:
    GLOBAL_APPROVAL_CACHE.clear()
    ident = TargetSessionIdentity(session_id="s", server_id="h", host_fingerprint="fp")
    cmd = "touch /tmp/once"
    assert not _store_if_session(
        approved=True, approve_for_session=False, identity=ident, command=cmd
    )
    assert (
        GLOBAL_APPROVAL_CACHE.lookup(ident, cmd, RiskLevel.R2, security_mode="safe")
        is None
    )
    GLOBAL_APPROVAL_CACHE.clear()


def test_session_stores_and_second_lookup_hits() -> None:
    GLOBAL_APPROVAL_CACHE.clear()
    ident = TargetSessionIdentity(session_id="s", server_id="h", host_fingerprint="fp")
    cmd = "touch /tmp/sess"
    assert _store_if_session(
        approved=True, approve_for_session=True, identity=ident, command=cmd
    )
    hit = GLOBAL_APPROVAL_CACHE.lookup(ident, cmd, RiskLevel.R2, security_mode="safe")
    assert hit is not None
    assert hit.canonical_command == canonicalize_command_for_approval(cmd)
    GLOBAL_APPROVAL_CACHE.clear()


def test_reject_does_not_store() -> None:
    GLOBAL_APPROVAL_CACHE.clear()
    ident = TargetSessionIdentity(session_id="s", server_id="h")
    cmd = "rm -rf /tmp/x"
    assert not _store_if_session(
        approved=False, approve_for_session=True, identity=ident, command=cmd
    )
    assert (
        GLOBAL_APPROVAL_CACHE.lookup(ident, cmd, RiskLevel.R2, security_mode="safe")
        is None
    )
    GLOBAL_APPROVAL_CACHE.clear()

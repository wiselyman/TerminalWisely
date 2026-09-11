"""Tests for session approval cache."""

from __future__ import annotations

from app.harness.approval_cache import GLOBAL_APPROVAL_CACHE, SessionApprovalCache
from app.models.approval import TargetSessionIdentity
from app.models.terminal import RiskLevel


def test_cache_store_and_lookup() -> None:
    cache = SessionApprovalCache()
    ident = TargetSessionIdentity(session_id="s1", server_id="host1")
    cache.store(
        ident,
        "systemctl restart nginx",
        exec_command="systemctl restart nginx",
        risk=RiskLevel.R2,
        rollback_plan=None,
        security_mode="safe",
    )
    hit = cache.lookup(
        ident, "systemctl restart nginx", RiskLevel.R2, security_mode="safe"
    )
    assert hit is not None
    assert hit.exec_command == "systemctl restart nginx"


def test_production_never_caches() -> None:
    cache = SessionApprovalCache()
    ident = TargetSessionIdentity(session_id="s1")
    assert not cache.store(
        ident,
        "rm /tmp/x",
        exec_command="rm /tmp/x",
        risk=RiskLevel.R3,
        rollback_plan=None,
        security_mode="production",
    )
    assert cache.lookup(ident, "rm /tmp/x", RiskLevel.R3, security_mode="production") is None


def test_network_mutate_never_caches() -> None:
    cache = SessionApprovalCache()
    ident = TargetSessionIdentity(session_id="s1")
    cmd = "iptables -A INPUT -p tcp --dport 22 -j ACCEPT"
    assert not cache.store(
        ident,
        cmd,
        exec_command=cmd,
        risk=RiskLevel.R3,
        rollback_plan={"apply": cmd},
        security_mode="safe",
    )


def test_global_cache_isolated_per_identity() -> None:
    GLOBAL_APPROVAL_CACHE.clear()
    a = TargetSessionIdentity(session_id="s1", server_id="a")
    b = TargetSessionIdentity(session_id="s1", server_id="b")
    GLOBAL_APPROVAL_CACHE.store(
        a,
        "touch /tmp/a",
        exec_command="touch /tmp/a",
        risk=RiskLevel.R2,
        rollback_plan=None,
        security_mode="safe",
    )
    assert GLOBAL_APPROVAL_CACHE.lookup(
        a, "touch /tmp/a", RiskLevel.R2, security_mode="safe"
    )
    assert GLOBAL_APPROVAL_CACHE.lookup(
        b, "touch /tmp/a", RiskLevel.R2, security_mode="safe"
    ) is None
    GLOBAL_APPROVAL_CACHE.clear()


def test_invalidate_session_drops_bucket() -> None:
    cache = SessionApprovalCache()
    ident = TargetSessionIdentity(
        session_id="s1", server_id="h", host_fingerprint="fp1", remote_user="root"
    )
    cache.store(
        ident,
        "touch /tmp/x",
        exec_command="touch /tmp/x",
        risk=RiskLevel.R2,
        rollback_plan=None,
        security_mode="safe",
    )
    cache.invalidate_session(ident)
    assert (
        cache.lookup(ident, "touch /tmp/x", RiskLevel.R2, security_mode="safe") is None
    )


def test_sync_identity_invalidates_on_fingerprint_change() -> None:
    from app.harness.approval_cache import (
        clear_identity_tracker,
        sync_identity_and_invalidate,
    )

    GLOBAL_APPROVAL_CACHE.clear()
    clear_identity_tracker()
    old = TargetSessionIdentity(
        session_id="tab1",
        server_id="root@10.0.0.1:22",
        host_fingerprint="aa",
        remote_user="root",
    )
    new = TargetSessionIdentity(
        session_id="tab1",
        server_id="root@10.0.0.1:22",
        host_fingerprint="bb",
        remote_user="root",
    )
    GLOBAL_APPROVAL_CACHE.store(
        old,
        "systemctl restart nginx",
        exec_command="systemctl restart nginx",
        risk=RiskLevel.R2,
        rollback_plan=None,
        security_mode="safe",
    )
    assert sync_identity_and_invalidate(old) is False
    assert sync_identity_and_invalidate(new) is True
    assert (
        GLOBAL_APPROVAL_CACHE.lookup(
            old, "systemctl restart nginx", RiskLevel.R2, security_mode="safe"
        )
        is None
    )
    GLOBAL_APPROVAL_CACHE.clear()
    clear_identity_tracker()

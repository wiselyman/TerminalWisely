"""Tests for persistent allow overrides."""

from __future__ import annotations

from pathlib import Path

from app.policy.persistent_allow import add_persistent_allow, is_persistent_allow


def test_persistent_allow_roundtrip(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    cmd = "systemctl restart nginx"
    assert add_persistent_allow(cmd, security_mode="safe")
    assert is_persistent_allow(cmd, security_mode="safe")
    assert not is_persistent_allow(cmd, security_mode="production")


def test_network_never_persistent(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    cmd = "iptables -A INPUT -j ACCEPT"
    assert not add_persistent_allow(cmd, security_mode="safe")
    assert not is_persistent_allow(cmd, security_mode="safe")

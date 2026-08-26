"""Tests for user policy overrides from approval UI."""

from __future__ import annotations

import pytest

from app.broker import CommandBroker
from app.models.terminal import PolicyAction
from app.policy.loader import build_bundle, bundled_policy_dir
from app.policy.user_overrides import add_read_binaries, rememberable_binaries


def test_rememberable_binaries_for_unknown_query_tool():
    names = rememberable_binaries(
        'tracepath 2606:4700:78::90 | grep -i country | head -20'
    )
    assert "tracepath" in names
    assert "grep" not in names
    assert "head" not in names


def test_rememberable_empty_for_package_mutate():
    assert rememberable_binaries("apt-get install -y foo") == []


def test_rememberable_empty_for_pip_install():
    assert rememberable_binaries("pip install requests") == []


def test_add_read_binaries_updates_policy(tmp_path, monkeypatch):
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    added = add_read_binaries(["whois", "whois"])
    assert added == ["whois"]

    bundle = build_bundle(
        policy_dir=bundled_policy_dir(),
        overrides_path=tmp_path / "policy" / "overrides.yaml",
    )
    assert "whois" in bundle.read_binaries

    broker = CommandBroker()
    d = broker.authorize("whois example.com")
    assert d.action == PolicyAction.ALLOW

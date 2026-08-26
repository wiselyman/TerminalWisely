"""Tests for on-demand skill matching."""

from __future__ import annotations

from app.skills.match import match_skills, skill_injection_block


def test_match_systemd_skill() -> None:
    hits = match_skills("nginx systemd service failed")
    ids = {h["id"] for h in hits}
    assert "systemd-debug" in ids or "nginx-config" in ids


def test_injection_block_marked_untrusted() -> None:
    hits = match_skills("check open ports on server")
    block = skill_injection_block(hits)
    if hits:
        assert "UNTRUSTED SKILL" in block

"""Unit tests for local CLI PATH probe (install-gate)."""

from __future__ import annotations

import os
from pathlib import Path

from app.runtime.local_cli import probe_local_cli, resolve_local_cli


def test_probe_missing_when_path_empty(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.delenv("TW_AI_CURSOR_FAKE", raising=False)
    p = probe_local_cli("cursor")
    assert p["installed"] is False
    assert p["code"] == "install_needed"
    assert "http" in (p.get("install_url") or "")
    assert resolve_local_cli("cursor") is None


def test_probe_finds_cursor_agent(monkeypatch, tmp_path: Path) -> None:
    fake = tmp_path / "cursor-agent"
    fake.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    fake.chmod(0o755)
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.delenv("TW_AI_CURSOR_FAKE", raising=False)
    p = probe_local_cli("cursor")
    assert p["installed"] is True
    assert p["code"] == "ready"
    assert p["fake"] is False
    assert "cursor-agent" in p["binary"]


def test_probe_fake_env_overrides_missing(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.setenv("TW_AI_CLAUDE_FAKE", "1")
    p = probe_local_cli("claude")
    assert p["installed"] is True
    assert p["fake"] is True
    assert p["code"] == "fake"


def test_probe_codex_and_claude_names(monkeypatch, tmp_path: Path) -> None:
    for name in ("codex", "claude"):
        b = tmp_path / name
        b.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        b.chmod(0o755)
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.delenv("TW_AI_CODEX_FAKE", raising=False)
    monkeypatch.delenv("TW_AI_CLAUDE_FAKE", raising=False)
    assert probe_local_cli("codex")["installed"] is True
    assert probe_local_cli("claude")["installed"] is True

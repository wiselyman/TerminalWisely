"""Tests for dual-plane remote host guidance / local desktop block."""

from __future__ import annotations

import json
from pathlib import Path

from app.runtime.cli_host import _parse_stream_line, build_cli_argv, write_tw_mcp_config
from app.runtime.remote_plane import (
    REMOTE_PLANE_ADDENDUM,
    is_local_desktop_impersonation,
    write_remote_plane_guidance,
)


def test_is_local_desktop_impersonation_cua_name() -> None:
    assert is_local_desktop_impersonation(name="codex.cua", detail="")
    assert is_local_desktop_impersonation(name="cursor.computer_use", detail="")
    assert not is_local_desktop_impersonation(name="codex.command_execution", detail="uptime")


def test_is_local_desktop_impersonation_cua_detail() -> None:
    assert is_local_desktop_impersonation(
        name="codex.js",
        detail='{"code": "await cua.getState()", "title": "check display"}',
    )
    assert not is_local_desktop_impersonation(
        name="codex.js",
        detail='{"code": "1+1", "title": "math"}',
    )


def test_write_remote_plane_guidance(tmp_path: Path) -> None:
    path = write_remote_plane_guidance(tmp_path)
    assert path.is_file()
    text = path.read_text(encoding="utf-8")
    assert "terminalwisely" in text
    assert "这台电脑" in text
    rule = tmp_path / ".cursor" / "rules" / "terminalwisely-remote-plane.mdc"
    assert rule.is_file()


def test_addendum_names_deixis_and_forbids_cua() -> None:
    assert "这台电脑" in REMOTE_PLANE_ADDENDUM
    assert "Computer Use" in REMOTE_PLANE_ADDENDUM or "CUA" in REMOTE_PLANE_ADDENDUM
    assert "terminalwisely" in REMOTE_PLANE_ADDENDUM


def test_codex_argv_disables_computer_use(monkeypatch, tmp_path: Path) -> None:
    from app.runtime.local_cli import ResolvedCli

    binary = str(tmp_path / "codex")
    monkeypatch.setattr(
        "app.runtime.cli_host.resolve_local_cli",
        lambda kind: ResolvedCli(kind="codex", binary=binary, argv_prefix=[binary]),
    )
    argv = build_cli_argv(
        "codex",
        prompt="hi",
        workspace=tmp_path,
        mcp_config=tmp_path / "tw_mcp.json",
    )
    assert "--disable" in argv
    assert "computer_use" in argv
    # --approve-for-me already implies workspace-write; Codex rejects -s with it.
    assert "--approve-for-me" in argv
    assert "-s" not in argv
    assert "--sandbox" not in argv


def test_parse_suppresses_codex_js_cua() -> None:
    line = json.dumps(
        {
            "type": "item.started",
            "item": {
                "id": "item_1",
                "type": "js",
                "code": "await cua.getState()",
                "title": "检查电脑显示状态",
            },
        }
    )
    assert _parse_stream_line("codex", line) == []


def test_write_tw_mcp_config_disables_computer_use_feature(tmp_path: Path) -> None:
    class _Run:
        run_id = "r1"
        session_id = "s1"
        metadata: dict = {}

    write_tw_mcp_config(_Run(), tmp_path)
    toml = (tmp_path / ".codex" / "config.toml").read_text(encoding="utf-8")
    assert "computer_use = false" in toml
    assert (tmp_path / "AGENTS.md").is_file()

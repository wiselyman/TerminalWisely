"""Long terminal waits: large downloads/builds must not die at 30–120s."""

from __future__ import annotations

import asyncio

import pytest

from app.harness.guards.timeout import ToolTimeoutGuard
from app.harness.pipeline import ToolExec
from app.tools.schema import TOOL_TERMINAL_EXEC, TOOL_WEB_SEARCH


def test_resolve_terminal_timeout_defaults_to_hours(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TW_AI_TERMINAL_TIMEOUT_DEFAULT", raising=False)
    monkeypatch.delenv("TW_AI_TERMINAL_TIMEOUT_MAX", raising=False)
    from app import paths

    assert paths.terminal_timeout_default_seconds() == 7200.0
    assert paths.terminal_timeout_max_seconds() == 86400.0
    assert paths.resolve_terminal_timeout_seconds(None) == 7200.0
    assert paths.resolve_terminal_timeout_seconds(30) == 30.0
    assert paths.resolve_terminal_timeout_seconds(999_999) == 86400.0


def test_max_tool_calls_default_allows_long_install_loops(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("TW_AI_MAX_TOOL_CALLS", raising=False)
    from app import paths

    assert paths.max_tool_calls() >= 96


@pytest.mark.asyncio
async def test_tool_timeout_payload_says_host_may_still_run() -> None:
    # Floor is 5s (resolve_terminal_timeout_seconds); keep this short but valid.
    guard = ToolTimeoutGuard(default_seconds=5.0, max_seconds=10.0)

    async def slow():
        await asyncio.sleep(6.0)
        return {"ok": True}

    tool = ToolExec(
        name=TOOL_TERMINAL_EXEC,
        call_id="c1",
        arguments={"command": "sleep 999", "timeout_seconds": 5},
    )
    out = await guard.around(tool, slow)
    assert out["error"] == "TOOL_TIMEOUT"
    assert out["host_may_still_be_running"] is True
    assert "still be running" in out["hint"]


def test_guard_uses_long_default_when_timeout_omitted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("TW_AI_TERMINAL_TIMEOUT_DEFAULT", "7200")
    monkeypatch.setenv("TW_AI_TERMINAL_TIMEOUT_MAX", "86400")
    guard = ToolTimeoutGuard()
    tool = ToolExec(
        name=TOOL_TERMINAL_EXEC,
        call_id="c1",
        arguments={"command": "echo hi"},
    )
    assert guard._timeout_for(tool) == 7200.0


def test_web_timeout_unchanged() -> None:
    guard = ToolTimeoutGuard()
    tool = ToolExec(name=TOOL_WEB_SEARCH, call_id="c1", arguments={"query": "x"})
    assert guard._timeout_for(tool) == 45.0

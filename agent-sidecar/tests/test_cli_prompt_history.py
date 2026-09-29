"""External CLI prompts must carry prior turns (follow-ups like "continue")."""

from __future__ import annotations

import pytest

from app.runtime.cli_host import LocalCliHost
from app.runtime.continuity_pack import (
    _MAX_CLI_PRIOR_CHARS,
    format_cli_prompt_with_history,
)
from app.runtime.fakes import FakeCursorDriver
from app.runtime.remote_plane import REMOTE_PLANE_ADDENDUM
from app.state import AgentRun, RunStatus


def test_format_cli_prompt_includes_prior_turns() -> None:
    prompt = format_cli_prompt_with_history(
        [
            {"role": "system", "content": "ignore me"},
            {"role": "user", "content": "FlClash 怎么用"},
            {"role": "assistant", "content": "选 A/B/C/D"},
            {"role": "tool", "tool_call_id": "c1", "content": "noise"},
        ],
        current_plain="继续",
    )
    assert REMOTE_PLANE_ADDENDUM in prompt
    assert "[Prior conversation" in prompt
    assert "User:\nFlClash 怎么用" in prompt
    assert "Assistant:\n选 A/B/C/D" in prompt
    assert "Tool (tool):\nnoise" in prompt
    assert prompt.rstrip().endswith("[Current user message]\n继续")
    assert prompt.count("继续") == 1


def test_format_cli_prompt_without_history() -> None:
    prompt = format_cli_prompt_with_history([], current_plain="uptime")
    assert REMOTE_PLANE_ADDENDUM in prompt
    assert "[Prior conversation" not in prompt
    assert prompt.rstrip().endswith("[Current user message]\nuptime")


def test_format_cli_prompt_keeps_recent_turns_under_budget() -> None:
    msgs = []
    for i in range(40):
        msgs.append({"role": "user", "content": f"u{i}-" + ("x" * 800)})
        msgs.append({"role": "assistant", "content": f"a{i}-" + ("y" * 800)})
    prompt = format_cli_prompt_with_history(msgs, current_plain="继续")
    prior = prompt.split("[Current user message]", 1)[0]
    assert len(prior) <= len(REMOTE_PLANE_ADDENDUM) + _MAX_CLI_PRIOR_CHARS + 200
    assert "u39-" in prompt
    assert "a39-" in prompt
    assert "u0-" not in prompt


@pytest.mark.asyncio
async def test_cli_host_fake_prompt_carries_seeded_history(
    tmp_path, monkeypatch
) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TW_AI_CURSOR_FAKE", "1")

    captured: list[str] = []

    class CaptureDriver(FakeCursorDriver):
        async def run(self, prompt, *, call_mcp):  # type: ignore[no-untyped-def]
            captured.append(prompt)
            yield {"type": "assistant_message", "text": "ok"}
            yield {"type": "done"}

    monkeypatch.setattr("app.runtime.cli_host.FakeCursorDriver", CaptureDriver)

    run = AgentRun(
        session_id="s",
        run_id="r-hist",
        metadata={"engineer_mode": "linux"},
    )
    run.append_message({"role": "user", "content": "先查 FlClash"})
    run.append_message({"role": "assistant", "content": "可选 A B C D"})
    host = LocalCliHost("cursor")
    await host.start(run, "继续")
    assert run.status == RunStatus.COMPLETED
    assert captured
    assert "先查 FlClash" in captured[0]
    assert "可选 A B C D" in captured[0]
    assert "[Current user message]\n继续" in captured[0]
    assert REMOTE_PLANE_ADDENDUM in captured[0]

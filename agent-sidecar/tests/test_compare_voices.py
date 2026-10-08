"""Compare voices stay read-only; one writer owns the SSH session."""

from __future__ import annotations

import pytest

from app.harness.interaction_mode import interaction_mode_prompt_addendum
from app.runtime.cli_session import build_runtime_argv, supports_read_only_launch
from app.runtime.tw_mcp import tw_mcp_tool_names
from app.state import STORE, RunStatus
from app.tools.schema import TOOL_TERMINAL_EXEC


@pytest.fixture(autouse=True)
def _token(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("TW_AI_TOKEN", "test-token")
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    STORE._runs.clear()
    STORE._session_latest.clear()


def test_pose_prompt_is_the_agent_loop() -> None:
    text = interaction_mode_prompt_addendum("plan")
    assert text == interaction_mode_prompt_addendum("ask")
    assert "approve" in text
    assert "wait for the user" not in text


def test_read_only_argv_drops_write_flags(tmp_path) -> None:
    assert supports_read_only_launch("codex")
    assert supports_read_only_launch("claude")
    assert supports_read_only_launch("cursor")
    codex = build_runtime_argv(
        "codex",
        prefix=["codex"],
        prompt="hi",
        workspace=tmp_path,
        mcp_config=tmp_path / "m.json",
        resume_id="thread-a",
        read_only=True,
    )
    assert "--sandbox" in codex
    assert codex[codex.index("--sandbox") + 1] == "read-only"
    assert "--approve-for-me" not in codex
    assert "resume" not in codex
    claude = build_runtime_argv(
        "claude",
        prefix=["claude"],
        prompt="hi",
        workspace=tmp_path,
        mcp_config=tmp_path / "m.json",
        resume_id="sess-1",
        read_only=True,
    )
    assert claude[claude.index("--permission-mode") + 1] == "plan"
    assert "--resume" not in claude
    cursor = build_runtime_argv(
        "cursor",
        prefix=["agent"],
        prompt="hi",
        workspace=tmp_path,
        mcp_config=tmp_path / "m.json",
        read_only=True,
    )
    assert cursor[cursor.index("--mode") + 1] == "ask"
    assert "-f" not in cursor
    cursor_plan = build_runtime_argv(
        "cursor",
        prefix=["agent"],
        prompt="hi",
        workspace=tmp_path,
        mcp_config=tmp_path / "m.json",
        read_only=True,
        read_only_mode="plan",
    )
    assert cursor_plan[cursor_plan.index("--mode") + 1] == "plan"
    writable = build_runtime_argv(
        "cursor",
        prefix=["agent"],
        prompt="hi",
        workspace=tmp_path,
        mcp_config=tmp_path / "m.json",
    )
    assert "-f" in writable
    assert "--mode" not in writable


def test_mcp_keeps_terminal_exec_regardless_of_old_pose() -> None:
    names = tw_mcp_tool_names(engineer_mode="linux", interaction_mode="plan")
    assert TOOL_TERMINAL_EXEC in names
    assert "web_search" in names
    ask = tw_mcp_tool_names(engineer_mode="linux", interaction_mode="ask")
    assert TOOL_TERMINAL_EXEC in ask
    k8s = tw_mcp_tool_names(engineer_mode="k8s", interaction_mode="plan")
    assert "k8s_apply" in k8s
    assert "k8s_get" in k8s


def test_one_writer_cancels_the_previous_run() -> None:
    first = STORE.create_run(
        "sess",
        "run-a",
        metadata={"compare_group": "g1"},
    )
    first.status = RunStatus.RUNNING
    second = STORE.create_run("sess", "run-b", metadata={})
    assert first.status == RunStatus.CANCELLED
    assert second.status != RunStatus.CANCELLED

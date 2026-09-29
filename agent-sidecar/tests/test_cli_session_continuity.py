"""Vendor resume argv and SessionLog evidence pack on resume miss."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.runtime.cli_host import (
    LocalCliHost,
    _parse_stream_line,
    build_cli_argv,
)
from app.runtime.cli_session import (
    remember_vendor_session,
    resume_attempt_accepted,
    stored_vendor_session_id,
    vendor_session_is_stale,
)
from app.runtime.continuity_pack import render_continuity_pack
from app.runtime.fakes import FakeCodexDriver, FakeCursorDriver
from app.runtime.local_cli import ResolvedCli
from app.session.store import clone_log
from app.state import AgentRun, RunStatus


def _stub_resolve(monkeypatch, kind: str, binary: str) -> None:
    monkeypatch.setattr(
        "app.runtime.cli_host.resolve_local_cli",
        lambda _kind: ResolvedCli(kind=kind, binary=binary, argv_prefix=[binary]),
    )


def test_cursor_resume_argv(monkeypatch, tmp_path: Path) -> None:
    binary = str(tmp_path / "agent")
    _stub_resolve(monkeypatch, "cursor", binary)
    fresh = build_cli_argv(
        "cursor", prompt="hi", workspace=tmp_path, mcp_config=tmp_path / "m.json"
    )
    resumed = build_cli_argv(
        "cursor",
        prompt="next",
        workspace=tmp_path,
        mcp_config=tmp_path / "m.json",
        resume_id="chat-1",
    )
    assert "--resume" not in " ".join(fresh)
    assert "--resume=chat-1" in resumed
    assert "-p" in resumed
    assert resumed[-1] == "next"


def test_claude_resume_argv(monkeypatch, tmp_path: Path) -> None:
    binary = str(tmp_path / "claude")
    _stub_resolve(monkeypatch, "claude", binary)
    argv = build_cli_argv(
        "claude",
        prompt="next",
        workspace=tmp_path,
        mcp_config=tmp_path / "m.json",
        resume_id="sess-1",
    )
    assert argv[argv.index("--resume") + 1] == "sess-1"
    assert argv[-1] == "next"
    assert "--no-session-persistence" not in argv


def test_codex_resume_argv_omits_ephemeral(monkeypatch, tmp_path: Path) -> None:
    binary = str(tmp_path / "codex")
    _stub_resolve(monkeypatch, "codex", binary)
    argv = build_cli_argv(
        "codex",
        prompt="next",
        workspace=tmp_path,
        mcp_config=tmp_path / "m.json",
        resume_id="thread-a",
    )
    assert "--ephemeral" not in argv
    assert argv[argv.index("resume") + 1] == "thread-a"
    assert "--cd" in argv
    assert "--json" in argv
    assert "--approve-for-me" in argv
    assert "computer_use" in argv
    assert argv[-1] == "next"


def test_swapped_thread_id_is_not_acceptance() -> None:
    assert not resume_attempt_accepted(
        "codex", "thread-a", ["thread-b"], reject_text=""
    )
    assert resume_attempt_accepted(
        "claude", "sess-old", ["sess-new"], reject_text=""
    )
    assert not resume_attempt_accepted(
        "cursor", "chat-1", ["chat-1"], reject_text="session not found"
    )


def test_stream_session_ids_and_result_error() -> None:
    started = _parse_stream_line(
        "codex",
        '{"type":"thread.started","thread_id":"thread-a"}',
    )
    assert started == [{"type": "vendor_session", "session_id": "thread-a"}]
    result = _parse_stream_line(
        "claude",
        '{"type":"result","session_id":"sess-2","is_error":true,"result":"session not found"}',
    )
    assert {"type": "vendor_session", "session_id": "sess-2"} in result
    assert any(ev.get("type") == "resume_rejected" for ev in result)


def test_vendor_id_round_trips_through_cloned_log() -> None:
    run = AgentRun(session_id="s", run_id="r-vendor")
    remember_vendor_session(run, "cursor", "chat-1")
    cloned = AgentRun(
        session_id="s",
        run_id="r-vendor-2",
        session_log=clone_log(run.session_log),
    )
    assert stored_vendor_session_id(cloned, "cursor") == "chat-1"


def test_overlong_pack_writes_earlier_file(tmp_path: Path) -> None:
    msgs = []
    for i in range(40):
        msgs.append({"role": "user", "content": f"u{i}-" + ("x" * 800)})
        msgs.append({"role": "assistant", "content": f"a{i}-" + ("y" * 800)})
    render_continuity_pack(msgs, current_plain="next", workspace=tmp_path)
    earlier = tmp_path / "tw_continuity_earlier.md"
    assert earlier.is_file()
    body = earlier.read_text(encoding="utf-8")
    assert "u0-" in body
    assert "u39-" not in body


def _seed_exec(run: AgentRun) -> None:
    run.append_message({"role": "user", "content": "查连通"})
    run.append_message(
        {
            "role": "assistant",
            "content": "跑一下",
            "tool_calls": [
                {
                    "id": "call-1",
                    "type": "function",
                    "function": {
                        "name": "terminal_exec",
                        "arguments": '{"command":"ping"}',
                    },
                }
            ],
        }
    )
    run.append_message(
        {
            "role": "tool",
            "tool_call_id": "call-1",
            "content": "terminal_exec_stdout_9f3a",
        }
    )


@pytest.mark.asyncio
async def test_session_not_found_rebuilds_with_terminal_exec(
    tmp_path, monkeypatch
) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TW_AI_CURSOR_FAKE", "1")
    prompts: list[str] = []

    class RejectThenPack(FakeCursorDriver):
        async def run(self, prompt, *, call_mcp):  # type: ignore[no-untyped-def]
            prompts.append(prompt)
            if len(prompts) == 1:
                yield {"type": "resume_rejected", "text": "session not found"}
                return
            yield {"type": "vendor_session", "session_id": "chat-new"}
            yield {"type": "assistant_message", "text": "rebuilt"}
            yield {"type": "done"}

    monkeypatch.setattr("app.runtime.cli_host.FakeCursorDriver", RejectThenPack)
    run = AgentRun(session_id="s", run_id="r-miss", metadata={"engineer_mode": "linux"})
    _seed_exec(run)
    remember_vendor_session(run, "cursor", "chat-old")
    await LocalCliHost("cursor").start(run, "继续")
    assert run.status == RunStatus.COMPLETED
    assert len(prompts) == 2
    assert "terminal_exec_stdout_9f3a" not in prompts[0]
    assert "terminal_exec_stdout_9f3a" in prompts[1]
    assert "Tool (terminal_exec)" in prompts[1]
    assert stored_vendor_session_id(run, "cursor") == "chat-new"
    blob = " ".join(
        str(m.get("content") or "") for m in run.messages if isinstance(m, dict)
    )
    assert "rebuilt" in blob


@pytest.mark.asyncio
async def test_swapped_thread_id_rebuilds_and_drops_foreign_answer(
    tmp_path, monkeypatch
) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TW_AI_CODEX_FAKE", "1")
    prompts: list[str] = []

    class SwapDriver(FakeCodexDriver):
        async def run(self, prompt, *, call_mcp):  # type: ignore[no-untyped-def]
            prompts.append(prompt)
            if len(prompts) == 1:
                yield {"type": "vendor_session", "session_id": "thread-other"}
                yield {"type": "assistant_message", "text": "wrong thread"}
                yield {"type": "done"}
                return
            yield {"type": "vendor_session", "session_id": "thread-fresh"}
            yield {"type": "assistant_message", "text": "rebuilt"}
            yield {"type": "done"}

    monkeypatch.setattr("app.runtime.cli_host.FakeCodexDriver", SwapDriver)
    run = AgentRun(session_id="s", run_id="r-swap", metadata={"engineer_mode": "linux"})
    _seed_exec(run)
    remember_vendor_session(run, "codex", "thread-a")
    await LocalCliHost("codex").start(run, "继续")
    assert run.status == RunStatus.COMPLETED
    assert len(prompts) == 2
    assert "terminal_exec_stdout_9f3a" not in prompts[0]
    assert "terminal_exec_stdout_9f3a" in prompts[1]
    assert stored_vendor_session_id(run, "codex") == "thread-fresh"
    blob = " ".join(
        str(m.get("content") or "") for m in run.messages if isinstance(m, dict)
    )
    assert "wrong thread" not in blob
    assert "rebuilt" in blob


@pytest.mark.asyncio
async def test_confirmed_resume_does_not_paste_pack(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TW_AI_CLAUDE_FAKE", "1")
    prompts: list[str] = []

    class RotateDriver(FakeCursorDriver):
        async def run(self, prompt, *, call_mcp):  # type: ignore[no-untyped-def]
            prompts.append(prompt)
            yield {"type": "vendor_session", "session_id": "sess-new"}
            yield {"type": "assistant_message", "text": "continued"}
            yield {"type": "done"}

    monkeypatch.setattr("app.runtime.cli_host.FakeCursorDriver", RotateDriver)
    run = AgentRun(session_id="s", run_id="r-ok", metadata={"engineer_mode": "linux"})
    _seed_exec(run)
    # Bind after the seeded surface so the vendor session is not stale.
    remember_vendor_session(run, "claude", "sess-old")
    assert not vendor_session_is_stale(run, "claude")
    await LocalCliHost("claude").start(run, "继续")
    assert run.status == RunStatus.COMPLETED
    assert len(prompts) == 1
    assert "terminal_exec_stdout_9f3a" not in prompts[0]
    assert stored_vendor_session_id(run, "claude") == "sess-new"


@pytest.mark.asyncio
async def test_switch_runtime_then_back_uses_pack(tmp_path, monkeypatch) -> None:
    """Cursor → other agent → Cursor must not resume a behind vendor thread."""
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TW_AI_CURSOR_FAKE", "1")
    prompts: list[str] = []

    class CaptureDriver(FakeCursorDriver):
        async def run(self, prompt, *, call_mcp):  # type: ignore[no-untyped-def]
            prompts.append(prompt)
            yield {"type": "vendor_session", "session_id": f"chat-{len(prompts)}"}
            yield {"type": "assistant_message", "text": f"cursor-{len(prompts)}"}
            yield {"type": "done"}

    monkeypatch.setattr("app.runtime.cli_host.FakeCursorDriver", CaptureDriver)
    run = AgentRun(session_id="s", run_id="r-switch", metadata={"engineer_mode": "linux"})
    await LocalCliHost("cursor").start(run, "先查网络")
    assert stored_vendor_session_id(run, "cursor") == "chat-1"
    assert not vendor_session_is_stale(run, "cursor")

    # Another runtime advanced the same TW thread (builtin / Codex / Claude).
    run.append_message({"role": "user", "content": "换成另一个 agent 继续"})
    run.append_message(
        {
            "role": "assistant",
            "content": "foreign_agent_said_netbird_ok",
        }
    )
    assert vendor_session_is_stale(run, "cursor")

    await LocalCliHost("cursor").start(run, "根据上文总结")
    assert run.status == RunStatus.COMPLETED
    assert len(prompts) == 2
    # Stale vendor session → skip resume, one pack rebuild (no thin resume attempt).
    assert "foreign_agent_said_netbird_ok" in prompts[1]
    assert "[Prior conversation" in prompts[1]
    assert stored_vendor_session_id(run, "cursor") == "chat-2"


@pytest.mark.asyncio
async def test_same_agent_second_turn_resumes_without_pack(
    tmp_path, monkeypatch
) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TW_AI_CURSOR_FAKE", "1")
    prompts: list[str] = []

    class CaptureDriver(FakeCursorDriver):
        async def run(self, prompt, *, call_mcp):  # type: ignore[no-untyped-def]
            prompts.append(prompt)
            sid = "chat-stable" if len(prompts) > 1 else "chat-stable"
            yield {"type": "vendor_session", "session_id": sid}
            yield {"type": "assistant_message", "text": f"turn-{len(prompts)}"}
            yield {"type": "done"}

    monkeypatch.setattr("app.runtime.cli_host.FakeCursorDriver", CaptureDriver)
    run = AgentRun(session_id="s", run_id="r-same", metadata={"engineer_mode": "linux"})
    await LocalCliHost("cursor").start(run, "第一步")
    assert not vendor_session_is_stale(run, "cursor")
    await LocalCliHost("cursor").start(run, "第二步")
    assert len(prompts) == 2
    assert "第一步" not in prompts[1] or "[Prior conversation" not in prompts[1]
    assert "[Current user message]\n第二步" in prompts[1]
    assert stored_vendor_session_id(run, "cursor") == "chat-stable"

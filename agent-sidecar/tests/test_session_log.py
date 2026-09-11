"""Unit tests for SessionLog surface + derive_messages + JSONL roundtrip."""

from __future__ import annotations

import json
from pathlib import Path

from app.harness.pipeline import PostToolDecision, PreToolDecision, ToolExec, ToolPipeline
from app.session.log import SessionLog, SurfaceOp
from app.session.store import load_session_log, save_session_log


def test_derive_messages_basic() -> None:
    log = SessionLog()
    log.append_system("sys")
    log.append_user("hi")
    log.append_assistant("hello", tool_calls=[{"id": "c1", "type": "function", "function": {"name": "terminal_exec", "arguments": "{}"}}])
    log.append_tool_result("c1", '{"ok": true}')
    msgs = log.derive_messages()
    assert [m["role"] for m in msgs] == ["system", "user", "assistant", "tool"]
    assert msgs[2]["tool_calls"][0]["id"] == "c1"
    assert msgs[3]["tool_call_id"] == "c1"


def test_surface_replace_shadows_range() -> None:
    log = SessionLog()
    log.append_user("a")
    log.append_user("b")
    log.append_user("c")
    assert len(log.derive_messages()) == 3
    # Replace indices 0..1 with a summary user message
    log.append(
        "user/message",
        {"content": "SUMMARY(a,b)"},
        surface_op=SurfaceOp.replace(0, 1),
    )
    msgs = log.derive_messages()
    assert [m["content"] for m in msgs] == ["SUMMARY(a,b)", "c"]
    # Raw log keeps everything
    assert len(log.events) == 4


def test_jsonl_roundtrip(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    log = SessionLog()
    log.append_system("s")
    log.append_user("u")
    log.append_assistant("a")
    path = save_session_log("sess1", "run1", log)
    assert path.is_file()
    loaded = load_session_log("sess1", "run1")
    assert loaded is not None
    assert loaded.derive_messages() == log.derive_messages()
    # Reload via text
    again = SessionLog.from_jsonl_text(path.read_text(encoding="utf-8"))
    assert again.derive_messages() == log.derive_messages()


def test_seed_and_agent_run_messages_projection() -> None:
    from app.state import AgentRun

    run = AgentRun(session_id="s", run_id="r")
    run.append_message({"role": "system", "content": "sys"})
    run.append_message({"role": "user", "content": "q"})
    assert run.messages[0]["role"] == "system"
    # append on projection copy must not stick — use append_message
    run.messages.append({"role": "user", "content": "ghost"})  # type: ignore[attr-defined]
    assert len(run.messages) == 2


async def _async_pipeline_deny() -> None:
    class DenyHook:
        async def pre(self, tool: ToolExec) -> PreToolDecision:
            return PreToolDecision(
                action="deny",
                result={"ok": False, "denied": True, "_pipeline_deny": True},
            )

    pipe = ToolPipeline(pre_hooks=[DenyHook()])
    called = {"n": 0}

    async def body() -> None:
        called["n"] += 1

    out = await pipe.run(ToolExec("c", "terminal_exec", {}), body)
    assert called["n"] == 0
    assert out["denied"] is True


async def _async_pipeline_post_context() -> None:
    class PostHook:
        async def post(self, tool: ToolExec, result: object) -> PostToolDecision:
            return PostToolDecision(additional_contexts=["stop repeating"])

    pipe = ToolPipeline(post_hooks=[PostHook()])
    tool = ToolExec("c", "terminal_exec", {"command": "ls"})

    async def body() -> str:
        return "ok"

    assert await pipe.run(tool, body) == "ok"
    assert tool.meta["additional_contexts"] == ["stop repeating"]


def test_pipeline_deny_and_post(asyncio_run=None) -> None:
    import asyncio

    asyncio.run(_async_pipeline_deny())
    asyncio.run(_async_pipeline_post_context())


def test_request_equals_derive_after_ops() -> None:
    log = SessionLog()
    log.append_system("s")
    log.append_user("u1")
    log.append_assistant("", [{"id": "t1", "type": "function", "function": {"name": "x", "arguments": "{}"}}])
    log.append_tool_call_log("t1", "x", {})
    log.append_tool_result("t1", json.dumps({"ok": True}))
    a = log.derive_messages()
    b = log.derive_messages()
    assert a == b
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)

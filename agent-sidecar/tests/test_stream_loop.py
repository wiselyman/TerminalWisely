"""Light AgentLoop streaming event test with mock model."""

from __future__ import annotations

import asyncio
from typing import Any, AsyncIterator

import pytest

from app.agent.loop import AgentLoop
from app.llm.gateway import ModelGateway
from app.state import AgentRun, RunStatus


class _StreamModel:
    async def chat_completions(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        raise AssertionError("non-stream should not be used")

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
    ) -> AsyncIterator[dict[str, Any]]:
        yield {"type": "content", "text": "主机"}
        yield {"type": "content", "text": "正常"}
        yield {"type": "finished", "finish_reason": "stop"}

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return ModelGateway.extract_assistant_message(completion)


@pytest.mark.asyncio
async def test_loop_emits_assistant_delta_then_message() -> None:
    run = AgentRun(session_id="s1", run_id="r1")
    loop = AgentLoop(run, model=_StreamModel(), max_tool_calls=4, max_run_seconds=30)
    await loop.run_until_pause_or_done(user_message="状态？")
    types = [e.type for e in run.events]
    assert "assistant_delta" in types
    assert "assistant_message" in types
    assert run.status == RunStatus.COMPLETED
    deltas = "".join(
        str(e.payload.get("text") or "")
        for e in run.events
        if e.type == "assistant_delta"
    )
    assert "主机" in deltas
    final = next(e for e in run.events if e.type == "assistant_message")
    assert "主机正常" in str(final.payload.get("content") or "")


class _ToolThenAnswerModel:
    """First turn: command dump + tool_calls; second: real answer."""

    def __init__(self) -> None:
        self.calls = 0

    async def chat_completions(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        raise AssertionError("non-stream should not be used")

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
    ) -> Any:
        self.calls += 1
        dump = (
            "lscpu | grep -E \"Model name|Architecture|CPU(s)|Thread|Core|Socket\"\n"
            "free -h\n"
            "df -h /\n"
            "cat /etc/os-release | grep PRETTY_NAME\n"
        ) * 3
        if self.calls == 1:
            yield {"type": "content", "text": dump}
            yield {
                "type": "tool_call_delta",
                "index": 0,
                "id": "call_ps_1",
                "name": "terminal_exec",
                "arguments": '{"command":"ps aux --sort=-%mem | head -n 10"}',
            }
            yield {"type": "finished", "finish_reason": "tool_calls"}
            return
        yield {"type": "content", "text": "占用内存最多的是 gnome-shell。"}
        yield {"type": "finished", "finish_reason": "stop"}

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return ModelGateway.extract_assistant_message(completion)


@pytest.mark.asyncio
async def test_tool_turn_with_command_dump_does_not_abort() -> None:
    from app.agent.loop import deliver_tool_result
    from app.harness.verify import LOOP_ABORT_MESSAGE as MSG

    run = AgentRun(session_id="s2", run_id="r2")
    model = _ToolThenAnswerModel()
    loop = AgentLoop(run, model=model, max_tool_calls=8, max_run_seconds=30)

    async def _feed() -> None:
        for _ in range(200):
            if run.status == RunStatus.WAITING_TOOL and run.pending_tool:
                break
            await asyncio.sleep(0.01)
        else:
            raise AssertionError("timed out waiting for WAITING_TOOL")
        assert run.pending_tool is not None
        deliver_tool_result(
            run,
            run.pending_tool.call_id,
            {
                "ok": True,
                "exit_code": 0,
                "stdout": "USER PID %MEM CMD\nwyf 1 12.0 gnome-shell\n",
                "stderr": "",
                "_untrusted": True,
            },
        )

    feeder = asyncio.create_task(_feed())
    await loop.run_until_pause_or_done(user_message="现在哪个程序占用的内存最大")
    await feeder
    texts = [
        str(e.payload.get("content") or "")
        for e in run.events
        if e.type == "assistant_message"
    ]
    assert MSG not in texts
    assert run.status == RunStatus.COMPLETED
    assert any("gnome-shell" in t for t in texts)


class _CotThenEmptyModel:
    """After tools exist, emit English CoT only (would wipe content) twice."""

    def __init__(self) -> None:
        self.calls = 0

    async def chat_completions(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        raise AssertionError("non-stream should not be used")

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
    ) -> Any:
        self.calls += 1
        if self.calls == 1:
            yield {
                "type": "tool_call_delta",
                "index": 0,
                "id": "call_os_1",
                "name": "terminal_exec",
                "arguments": '{"command":"cat /etc/os-release"}',
            }
            yield {"type": "finished", "finish_reason": "tool_calls"}
            return
        # CoT-only turns — sanitize to empty; must NOT LOOP_ABORT when tools exist.
        yield {
            "type": "content",
            "text": (
                "Here's a thinking process:\n\n"
                "The user wants to know the OS. I should conclude from tools.\n\n"
                "1. **Identify the goal**: answer OS.\n"
                "2. **Plan**: narrate without answering."
            ),
        }
        yield {"type": "finished", "finish_reason": "stop"}

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return ModelGateway.extract_assistant_message(completion)


@pytest.mark.asyncio
async def test_cot_empty_after_tools_does_not_loop_abort() -> None:
    from app.agent.loop import deliver_tool_result
    from app.harness.verify import LOOP_ABORT_MESSAGE as MSG

    run = AgentRun(session_id="s3", run_id="r3")
    model = _CotThenEmptyModel()
    loop = AgentLoop(run, model=model, max_tool_calls=8, max_run_seconds=30)

    async def _feed() -> None:
        for _ in range(200):
            if run.status == RunStatus.WAITING_TOOL and run.pending_tool:
                break
            await asyncio.sleep(0.01)
        else:
            raise AssertionError("timed out waiting for WAITING_TOOL")
        assert run.pending_tool is not None
        deliver_tool_result(
            run,
            run.pending_tool.call_id,
            {
                "ok": True,
                "exit_code": 0,
                "stdout": "PRETTY_NAME=\"Debian GNU/Linux 12 (bookworm)\"\nID=debian\n",
                "stderr": "",
                "_untrusted": True,
            },
        )

    feeder = asyncio.create_task(_feed())
    await loop.run_until_pause_or_done(user_message="这是什么操作系统")
    await feeder
    texts = [
        str(e.payload.get("content") or "")
        for e in run.events
        if e.type == "assistant_message"
    ]
    assert MSG not in texts
    assert run.status == RunStatus.COMPLETED
    assert any(e.type == "act_nudge" for e in run.events)

"""Light AgentLoop streaming event test with mock model."""

from __future__ import annotations

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

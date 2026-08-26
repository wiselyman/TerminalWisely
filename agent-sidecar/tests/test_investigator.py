"""Tests for depth-1 investigator subagent."""

from __future__ import annotations

import asyncio
from typing import Any

from app.agent.loop import AgentLoop, deliver_tool_result
from app.broker import CommandBroker
from app.state import AgentRun, RunStatus
from app.subagent.investigator import can_spawn_investigator, run_investigator
from app.tools.schema import investigator_tools, openai_tools


class _FakeInvestigatorModel:
    """First call: service_status tool; second: plain conclusion."""

    def __init__(self) -> None:
        self.n = 0

    async def chat_completions(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: str | dict[str, Any] | None = "auto",
    ) -> dict[str, Any]:
        self.n += 1
        if self.n == 1:
            return {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": "",
                            "tool_calls": [
                                {
                                    "id": "inv_c1",
                                    "type": "function",
                                    "function": {
                                        "name": "service_status",
                                        "arguments": (
                                            '{"unit":"nginx","intent":"check nginx"}'
                                        ),
                                    },
                                }
                            ],
                        }
                    }
                ]
            }
        return {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "nginx is active (evidence from service_status).",
                    }
                }
            ]
        }

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        from app.llm.gateway import ModelGateway

        return ModelGateway.extract_assistant_message(completion)


async def _drive_with_host(parent: AgentRun, coro: Any) -> dict[str, Any]:
    """Run investigator while auto-answering bridged host tool waits."""
    task = asyncio.create_task(coro)

    async def feeder() -> None:
        for _ in range(40):
            if task.done():
                return
            pending = parent.pending_tool
            if pending and not pending.future.done():
                deliver_tool_result(
                    parent,
                    pending.call_id,
                    {
                        "ok": True,
                        "exit_code": 0,
                        "stdout": "active\nActiveState=active",
                        "stderr": "",
                    },
                )
            await asyncio.sleep(0.01)

    feed = asyncio.create_task(feeder())
    try:
        return await task
    finally:
        feed.cancel()
        try:
            await feed
        except asyncio.CancelledError:
            pass


def test_investigator_tools_exclude_mutations() -> None:
    names = {(t.get("function") or {}).get("name") for t in investigator_tools()}
    assert "terminal_exec" in names
    assert "service_status" in names
    assert "ask_user" not in names
    assert "submit_ops_plan" not in names
    assert "spawn_investigator" not in names
    assert "spawn_investigator" in {
        (t.get("function") or {}).get("name") for t in openai_tools()
    }


def test_depth_gate() -> None:
    parent = AgentRun(session_id="s", run_id="r", persist_session=False)
    assert can_spawn_investigator(parent)
    parent.metadata["delegation_depth"] = 1
    assert not can_spawn_investigator(parent)


def test_investigator_observe_run() -> None:
    parent = AgentRun(
        session_id="s",
        run_id="parent",
        security_mode="safe",
        persist_session=False,
    )
    model = _FakeInvestigatorModel()
    result = asyncio.run(
        _drive_with_host(
            parent,
            run_investigator(
                parent,
                question="Is nginx running?",
                focus="nginx",
                model=model,  # type: ignore[arg-type]
                broker=CommandBroker(),
                research=None,  # type: ignore[arg-type]
            ),
        )
    )
    assert result.get("ok") is True
    assert "nginx" in str(result.get("summary") or "").lower()
    types = [e.type for e in parent.events]
    assert "investigator_start" in types
    assert "investigator_end" in types
    assert any(e.type == "tool_call" and e.payload.get("investigator") for e in parent.events)


def test_parent_spawn_tool_handler() -> None:
    parent = AgentRun(session_id="s", run_id="p", persist_session=False)
    model = _FakeInvestigatorModel()
    loop = AgentLoop(parent, model=model, broker=CommandBroker(), research=None)  # type: ignore[arg-type]

    async def run() -> None:
        task = asyncio.create_task(
            loop._spawn_investigator(
                "c_spawn",
                {"question": "check nginx", "focus": "nginx"},
            )
        )

        async def feed() -> None:
            for _ in range(40):
                if task.done():
                    return
                pending = parent.pending_tool
                if pending and not pending.future.done():
                    deliver_tool_result(
                        parent,
                        pending.call_id,
                        {"ok": True, "exit_code": 0, "stdout": "active", "stderr": ""},
                    )
                await asyncio.sleep(0.01)

        feeder = asyncio.create_task(feed())
        try:
            await task
        finally:
            feeder.cancel()
            try:
                await feeder
            except asyncio.CancelledError:
                pass

    asyncio.run(run())
    tool_msgs = [m for m in parent.messages if m.get("role") == "tool"]
    assert tool_msgs
    assert "nginx" in tool_msgs[-1]["content"].lower() or "summary" in tool_msgs[-1]["content"].lower()

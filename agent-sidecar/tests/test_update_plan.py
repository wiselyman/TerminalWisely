"""Tests for UI-only update_plan tool."""

from __future__ import annotations

import asyncio

from app.agent.loop import AgentLoop
from app.state import AgentRun


async def _run_update_plan() -> AgentRun:
    run = AgentRun(session_id="s", run_id="r", persist_session=False)
    loop = AgentLoop(run, model=None, broker=None, research=None)
    await loop._handle_tool_call(
        {
            "id": "c1",
            "type": "function",
            "function": {
                "name": "update_plan",
                "arguments": '{"plan":[{"step":"Check nginx","status":"in_progress"}]}',
            },
        }
    )
    return run


def test_update_plan_emits_progress_only() -> None:
    run = asyncio.run(_run_update_plan())
    types = [e.type for e in run.events]
    assert "plan_progress" in types
    assert run.metadata.get("active_plan")
    tool_msgs = [m for m in run.messages if m.get("role") == "tool"]
    assert len(tool_msgs) == 1
    assert "Plan updated" in tool_msgs[0]["content"]

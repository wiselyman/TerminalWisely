"""AgentLoop with fake model + fake tool_result completes."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest

from app.agent.loop import AgentLoop, deliver_tool_result
from app.state import AgentRun, RunStatus


class FakeModel:
    """First call: terminal_exec; second call: final answer."""

    def __init__(self) -> None:
        self.calls = 0

    async def chat_completions(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: str | dict[str, Any] | None = "auto",
    ) -> dict[str, Any]:
        self.calls += 1
        if self.calls == 1:
            return {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": "Checking who owns port 8888.",
                            "tool_calls": [
                                {
                                    "id": "call_ss_1",
                                    "type": "function",
                                    "function": {
                                        "name": "terminal_exec",
                                        "arguments": json.dumps(
                                            {"command": "ss -lntp | grep 8888"}
                                        ),
                                    },
                                }
                            ],
                        }
                    }
                ]
            }
        # After tool result in history, finish.
        return {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "Port 8888 is held by python (pid 4242).",
                    }
                }
            ]
        }

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return completion["choices"][0]["message"]


@pytest.mark.asyncio
async def test_agent_loop_terminal_exec_then_complete():
    run = AgentRun(session_id="sess-1", run_id="run-1")
    model = FakeModel()
    loop = AgentLoop(run, model=model, max_tool_calls=10, max_run_seconds=30)

    async def _feed_tool_result() -> None:
        # Wait until loop is waiting on host.
        for _ in range(200):
            if run.status == RunStatus.WAITING_TOOL and run.pending_tool:
                break
            await asyncio.sleep(0.01)
        else:
            raise AssertionError("timed out waiting for WAITING_TOOL")
        assert run.pending_tool is not None
        assert run.pending_tool.call_id == "call_ss_1"
        ok = deliver_tool_result(
            run,
            "call_ss_1",
            {
                "ok": True,
                "stdout": "LISTEN 0 128 *:8888 *:* users:((\"python\",pid=4242,fd=3))",
                "stderr": "",
                "exit_code": 0,
                "_untrusted": True,
            },
        )
        assert ok is True

    feeder = asyncio.create_task(_feed_tool_result())
    await loop.run_until_pause_or_done("8888端口是谁占用的？")
    await feeder

    assert run.status == RunStatus.COMPLETED
    assert model.calls == 2
    assert any(e.type == "tool_call" for e in run.events)
    assert any(e.type == "tool_result" for e in run.events)
    assert any(e.type == "completed" for e in run.events)
    # History preserved: system + user + assistant(tool) + tool + assistant(final)
    roles = [m["role"] for m in run.messages]
    assert roles[0] == "system"
    assert "tool" in roles
    assert roles.count("assistant") >= 2

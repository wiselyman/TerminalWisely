"""Host-wait loop smoke for k8s_* tools (FE bridge simulated)."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest

from app.agent.loop import AgentLoop, deliver_tool_result
from app.broker import CommandBroker
from app.models.approval import TargetSessionIdentity
from app.state import AgentRun, RunStatus
from app.tools.schema import TOOL_K8S_LIST


class FakeK8sModel:
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
        tool_names = {
            (t.get("function") or {}).get("name") for t in (tools or [])
        }
        assert TOOL_K8S_LIST in tool_names
        assert "terminal_exec" not in tool_names
        assert "submit_ops_plan" not in tool_names
        if self.calls == 1:
            return {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": "Listing pods.",
                            "tool_calls": [
                                {
                                    "id": "call_list",
                                    "type": "function",
                                    "function": {
                                        "name": "k8s_list",
                                        "arguments": json.dumps(
                                            {
                                                "category": "pods",
                                                "namespace": "demo",
                                                "intent": "List demo pods",
                                            }
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
                        "content": "demo namespace has pods including multi and web.",
                    }
                }
            ]
        }


@pytest.mark.asyncio
async def test_k8s_list_awaits_host_and_continues() -> None:
    run = AgentRun(
        session_id="k8s:cluster-1",
        run_id="run_k8s_1",
        security_mode="safe",
        identity=TargetSessionIdentity(session_id="k8s:cluster-1"),
        metadata={
            "engineer_mode": "k8s",
            "cluster_id": "cluster-1",
            "cluster_name": "k3s-local",
            "cluster_target": {
                "id": "cluster-1",
                "kind": "kubeconfig",
                "display_name": "k3s-local",
            },
        },
        persist_session=False,
    )
    loop = AgentLoop(
        run,
        model=FakeK8sModel(),
        broker=CommandBroker(),
        max_tool_calls=10,
        max_run_seconds=30,
    )

    async def deliver_host_result() -> None:
        for _ in range(200):
            if run.status == RunStatus.WAITING_TOOL and run.pending_tool:
                break
            await asyncio.sleep(0.01)
        else:
            raise AssertionError("k8s_list host wait never armed")
        assert run.pending_tool is not None
        assert run.pending_tool.tool_name == "k8s_list"
        events = [e for e in run.events if e.type == "tool_call"]
        assert events
        args = events[-1].payload.get("arguments") or {}
        assert args.get("cluster_target", {}).get("id") == "cluster-1"
        ok = deliver_tool_result(
            run,
            "call_list",
            {
                "ok": True,
                "stdout": json.dumps(
                    [{"name": "multi", "namespace": "demo", "status": "Running"}]
                ),
                "stderr": "",
                "exit_code": 0,
                "_untrusted": True,
            },
        )
        assert ok is True

    helper = asyncio.create_task(deliver_host_result())
    await loop.run_until_pause_or_done("List pods in demo")
    await helper
    assert run.status == RunStatus.COMPLETED
    tool_msgs = [m for m in run.messages if m.get("role") == "tool"]
    assert tool_msgs
    assert "multi" in str(tool_msgs[0].get("content") or "")

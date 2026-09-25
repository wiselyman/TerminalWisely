"""TW MCP in-process tool bridge tests."""

from __future__ import annotations

from typing import Any

import pytest

from app.agent.loop import AgentLoop
from app.research.provider import ResearchProvider
from app.runtime.tw_mcp import TwMcpServer, tw_mcp_list_tools, tw_mcp_tool_names
from app.state import AgentRun, RunStatus
from app.tools.schema import TOOL_TERMINAL_EXEC, TOOL_WEB_SEARCH


class SilentModel:
    async def chat_completions(self, messages, tools=None, **kwargs):  # type: ignore[no-untyped-def]
        return {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "unused",
                        "tool_calls": [],
                    }
                }
            ]
        }

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return completion["choices"][0]["message"]


class FakeResearch(ResearchProvider):
    async def web_search(self, query: str, max_results: int = 5) -> list[dict[str, Any]]:
        return [
            {
                "title": "Hit",
                "url": "https://example.com",
                "snippet": f"about {query}",
                "_untrusted": True,
            }
        ]


def test_tw_mcp_lists_linux_and_k8s_tools() -> None:
    linux = tw_mcp_tool_names(engineer_mode="linux")
    assert TOOL_TERMINAL_EXEC in linux
    assert TOOL_WEB_SEARCH in linux
    assert "k8s_list" not in linux
    k8s = tw_mcp_tool_names(engineer_mode="k8s")
    assert "k8s_list" in k8s
    assert TOOL_TERMINAL_EXEC not in k8s
    descs = tw_mcp_list_tools(engineer_mode="linux")
    assert any(t["name"] == TOOL_WEB_SEARCH for t in descs)
    assert all("description" in t for t in descs)


@pytest.mark.asyncio
async def test_tw_mcp_web_search_via_loop_handlers() -> None:
    run = AgentRun(session_id="s", run_id="r", metadata={"engineer_mode": "linux"})
    loop = AgentLoop(run, model=SilentModel(), research=FakeResearch())
    mcp = TwMcpServer(loop)
    result = await mcp.call_tool(TOOL_WEB_SEARCH, {"query": "nginx status"})
    assert result.get("ok") is True
    assert result.get("results")
    assert any(
        ev.type == "tool_result" for ev in run.events
    )


@pytest.mark.asyncio
async def test_tw_mcp_rejects_unknown_tool() -> None:
    run = AgentRun(session_id="s", run_id="r")
    loop = AgentLoop(run, model=SilentModel(), research=FakeResearch())
    mcp = TwMcpServer(loop)
    result = await mcp.call_tool("not_a_tw_tool", {})
    assert result.get("ok") is False
    assert "not exposed" in str(result.get("error") or "").lower()


@pytest.mark.asyncio
async def test_tw_mcp_terminal_exec_waits_for_host() -> None:
    run = AgentRun(session_id="s", run_id="r", metadata={"engineer_mode": "linux"})
    loop = AgentLoop(run, model=SilentModel(), research=FakeResearch())
    mcp = TwMcpServer(loop)

    async def deliver() -> None:
        # Wait until pending_tool is armed, then complete host capture.
        for _ in range(50):
            if run.pending_tool is not None:
                break
            import asyncio

            await asyncio.sleep(0.01)
        assert run.pending_tool is not None
        run.pending_tool.future.set_result(
            {
                "ok": True,
                "stdout": "Linux\n",
                "stderr": "",
                "exit_code": 0,
                "_untrusted": True,
            }
        )

    import asyncio

    deliver_task = asyncio.create_task(deliver())
    result = await mcp.call_tool(
        TOOL_TERMINAL_EXEC,
        {"command": "uname", "intent": "check kernel"},
    )
    await deliver_task
    assert result.get("ok") is True
    assert "Linux" in str(result.get("stdout") or "")
    assert run.status in (RunStatus.RUNNING, RunStatus.COMPLETED, RunStatus.IDLE)

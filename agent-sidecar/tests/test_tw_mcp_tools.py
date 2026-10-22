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


def test_local_target_lists_only_home_mcp_tools() -> None:
    names = tw_mcp_tool_names(target="local")
    assert names == ["terminal_exec", "web_search", "web_fetch", "ask_user"]
    assert "k8s_list" not in names
    assert "db_query" not in names


def test_local_openai_tools_match_mcp_names() -> None:
    from app.harness.interaction_mode import tools_for_interaction_mode

    tools = tools_for_interaction_mode("agent", target="local")
    names = [(item.get("function") or {}).get("name") for item in tools]
    assert names == ["terminal_exec", "web_search", "web_fetch", "ask_user"]


def test_local_prompt_targets_this_computer() -> None:
    from app.agent.prompts import build_system_prompt

    text = build_system_prompt(target="local", machine_os="TestOS")
    assert "CONNECTED Terminal" not in text
    assert "TestOS" in text
    assert "MCP" in text


def test_local_mutation_is_not_preapproved() -> None:
    from app.broker import CommandBroker
    from app.models.terminal import PolicyAction

    decision = CommandBroker().authorize("rm -rf /", security_mode="safe")
    assert decision.action == PolicyAction.DENY


@pytest.mark.asyncio
async def test_local_terminal_exec_marks_target() -> None:
    run = AgentRun(
        session_id="local",
        run_id="r-local",
        metadata={"engineer_mode": "linux", "target": "local"},
    )
    loop = AgentLoop(run, model=SilentModel(), research=FakeResearch())

    async def deliver() -> None:
        import asyncio

        for _ in range(50):
            if run.pending_tool is not None:
                break
            await asyncio.sleep(0.01)
        assert run.pending_tool is not None
        run.pending_tool.future.set_result(
            {"ok": True, "stdout": "ok\n", "stderr": "", "exit_code": 0}
        )

    import asyncio

    deliver_task = asyncio.create_task(deliver())
    await loop._terminal_exec("c-local", {"command": "uname", "intent": "name"})
    await deliver_task
    marked = [
        event
        for event in run.events
        if event.type == "tool_call" and event.payload.get("target") == "local"
    ]
    assert marked, run.events


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
async def test_tw_mcp_accepts_cursor_prefixed_tool_name() -> None:
    run = AgentRun(session_id="s", run_id="r", metadata={"engineer_mode": "linux"})
    loop = AgentLoop(run, model=SilentModel(), research=FakeResearch())
    mcp = TwMcpServer(loop)
    result = await mcp.call_tool(
        "terminalwisely-web_search",
        {"query": "x"},
    )
    assert result.get("ok") is True
    assert result.get("results")


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

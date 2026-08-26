"""Gate 2: web_search tool runs in-process and returns untrusted results into loop."""

from __future__ import annotations

from typing import Any

import pytest

from app.agent.loop import AgentLoop
from app.research.provider import ResearchProvider
from app.state import AgentRun, RunStatus


class OneShotThenAnswer:
    def __init__(self) -> None:
        self.n = 0

    async def chat_completions(self, messages, tools=None, **kwargs):  # type: ignore[no-untyped-def]
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
                                    "id": "w1",
                                    "type": "function",
                                    "function": {
                                        "name": "web_search",
                                        "arguments": '{"query":"OpenWrt OpenClash YouTube latency"}',
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
                        "content": "已检索公开资料，下一步回服务器验证。",
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
                "title": "Fake doc",
                "url": "https://example.com/doc",
                "snippet": f"results for {query}",
            }
        ]


@pytest.mark.asyncio
async def test_gate2_web_search_then_continue() -> None:
    run = AgentRun(session_id="s", run_id="r")
    loop = AgentLoop(run, model=OneShotThenAnswer(), research=FakeResearch())
    await loop.run_until_pause_or_done("OpenClash YouTube 延迟很高")
    assert run.status == RunStatus.COMPLETED
    # Tool observation present as untrusted data in messages
    tool_msgs = [m for m in run.messages if m.get("role") == "tool"]
    assert tool_msgs
    assert "_untrusted" in str(tool_msgs[-1].get("content"))
    assert any(
        e.type in ("assistant_message", "completed") and "验证" in str(e.payload)
        for e in run.events
    )

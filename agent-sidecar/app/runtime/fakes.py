"""Test doubles for external agent runtimes (no real Cursor/Codex SDK)."""

from __future__ import annotations

from typing import Any, AsyncIterator, Awaitable, Callable

from app.research.provider import ResearchProvider
from app.tools.schema import TOOL_WEB_SEARCH


class FakeResearch(ResearchProvider):
    async def web_search(self, query: str, max_results: int = 5) -> list[dict[str, Any]]:
        return [
            {
                "title": "Fake",
                "url": "https://example.com",
                "snippet": f"results for {query}",
                "_untrusted": True,
            }
        ]

    async def web_fetch(self, url: str, **kwargs: Any) -> dict[str, Any]:
        return {
            "ok": True,
            "url": url,
            "text": f"fake page for {url}",
            "_untrusted": True,
        }


class FakeCursorDriver:
    """
    Minimal Cursor-shaped driver: stream text, optionally call one TW MCP tool,
    then finish. Used in CI and when cursor-sdk / API key is absent.
    """

    def __init__(
        self,
        *,
        tool_name: str | None = TOOL_WEB_SEARCH,
        tool_args: dict[str, Any] | None = None,
        reply: str = "Cursor fake: done.",
    ) -> None:
        self.tool_name = tool_name
        self.tool_args = tool_args or {"query": "status"}
        self.reply = reply
        self.cancelled = False

    def cancel(self) -> None:
        self.cancelled = True

    async def run(
        self,
        prompt: str,
        *,
        call_mcp: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]],
    ) -> AsyncIterator[dict[str, Any]]:
        if self.cancelled:
            yield {"type": "cancelled"}
            return
        yield {
            "type": "assistant_delta",
            "text": f"Working on: {prompt[:120]}\n",
        }
        if self.tool_name and not self.cancelled:
            yield {
                "type": "external_tool_activity",
                "name": "cursor.plan",
                "detail": f"calling TW MCP {self.tool_name}",
            }
            result = await call_mcp(self.tool_name, self.tool_args)
            yield {
                "type": "external_tool_activity",
                "name": f"mcp.{self.tool_name}",
                "detail": (
                    "ok"
                    if result.get("ok") is not False
                    else str(result.get("error"))
                ),
                "ok": result.get("ok") is not False,
            }
        if self.cancelled:
            yield {"type": "cancelled"}
            return
        yield {"type": "assistant_message", "text": self.reply}
        yield {"type": "done"}

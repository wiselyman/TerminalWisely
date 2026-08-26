"""Tool execution timeout guard (DeepSeek timeout-policy inspired)."""

from __future__ import annotations

import asyncio
from typing import Any

from app.harness.pipeline import ToolAroundHook, ToolExec
from app.tools.schema import TOOL_TERMINAL_EXEC, TOOL_WEB_FETCH, TOOL_WEB_SEARCH

_DEFAULT_TIMEOUT = 120.0
_WEB_TIMEOUT = 45.0


class ToolTimeoutGuard(ToolAroundHook):
    """Abort tool body when it exceeds configured seconds."""

    def __init__(
        self,
        *,
        default_seconds: float = _DEFAULT_TIMEOUT,
        web_seconds: float = _WEB_TIMEOUT,
    ) -> None:
        self.default_seconds = default_seconds
        self.web_seconds = web_seconds

    def _timeout_for(self, tool: ToolExec) -> float:
        if tool.name in {TOOL_WEB_SEARCH, TOOL_WEB_FETCH}:
            return self.web_seconds
        if tool.name == TOOL_TERMINAL_EXEC:
            raw = tool.arguments.get("timeout_seconds")
            try:
                return max(5.0, float(raw if raw is not None else self.default_seconds))
            except (TypeError, ValueError):
                return self.default_seconds
        return self.default_seconds

    async def around(self, tool: ToolExec, call) -> Any:
        seconds = self._timeout_for(tool)
        try:
            return await asyncio.wait_for(call(), timeout=seconds)
        except TimeoutError:
            return {
                "ok": False,
                "error": "TOOL_TIMEOUT",
                "timeout_seconds": seconds,
                "_untrusted": True,
                "_pipeline_timeout": True,
            }

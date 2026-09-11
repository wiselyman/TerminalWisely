"""Tool execution timeout guard (DeepSeek timeout-policy inspired)."""

from __future__ import annotations

import asyncio
from typing import Any

from app import paths
from app.harness.pipeline import ToolAroundHook, ToolExec
from app.tools.schema import TOOL_TERMINAL_EXEC, TOOL_WEB_FETCH, TOOL_WEB_SEARCH

_WEB_TIMEOUT = 45.0


class ToolTimeoutGuard(ToolAroundHook):
    """Abort tool body when it exceeds configured seconds."""

    def __init__(
        self,
        *,
        default_seconds: float | None = None,
        max_seconds: float | None = None,
        web_seconds: float = _WEB_TIMEOUT,
    ) -> None:
        self.default_seconds = (
            float(default_seconds)
            if default_seconds is not None
            else paths.terminal_timeout_default_seconds()
        )
        self.max_seconds = (
            float(max_seconds)
            if max_seconds is not None
            else paths.terminal_timeout_max_seconds()
        )
        self.web_seconds = web_seconds

    def _timeout_for(self, tool: ToolExec) -> float:
        if tool.name in {TOOL_WEB_SEARCH, TOOL_WEB_FETCH}:
            return self.web_seconds
        if tool.name == TOOL_TERMINAL_EXEC:
            return paths.resolve_terminal_timeout_seconds(
                tool.arguments.get("timeout_seconds")
            )
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
                "host_may_still_be_running": True,
                "hint": (
                    "Wait budget ended; the remote command may still be running "
                    "(large downloads/builds often take hours). Inspect progress/"
                    "process status before re-running or re-cloning. Raise "
                    "timeout_seconds on the next wait if you only need to keep watching."
                ),
                "_untrusted": True,
                "_pipeline_timeout": True,
            }

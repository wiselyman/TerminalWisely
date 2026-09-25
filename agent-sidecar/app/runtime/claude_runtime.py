"""Claude Code runtime — local `claude` CLI (Fake only under TW_AI_CLAUDE_FAKE)."""

from __future__ import annotations

from typing import Any

from app.runtime import RuntimeKind
from app.runtime.cli_host import LocalCliHost


class ClaudeRuntime:
    kind: RuntimeKind = "claude"

    def __init__(self) -> None:
        self._host = LocalCliHost("claude")

    def probe(self) -> dict[str, Any]:
        return self._host.probe()

    def cancel(self, run: Any) -> None:
        self._host.cancel(run)

    async def start(self, run: Any, user_message: Any) -> None:
        await self._host.start(run, user_message)


def probe_claude() -> dict[str, Any]:
    return ClaudeRuntime().probe()

"""Builtin runtime — today's AgentLoop via LangGraph entrypoint."""

from __future__ import annotations

from typing import Any

from app.agent.graph import start_run_via_graph
from app.runtime import RuntimeKind


class BuiltinRuntime:
    kind: RuntimeKind = "builtin"

    async def start(self, run: Any, user_message: Any) -> None:
        await start_run_via_graph(run, user_message)

    def cancel(self, run: Any) -> None:
        # Existing cancel_run path owns task cancellation.
        return None

    def probe(self) -> dict[str, Any]:
        return {
            "installed": True,
            "authenticated": True,
            "detail": "builtin ModelGateway + AgentLoop",
        }

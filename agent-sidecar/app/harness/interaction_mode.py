"""Chat pose is always the full agent loop.

Ask and Plan were a second switch on top of SecurityMode. Host changes are
gated by PolicyEngine and the thread security mode, not by a pose.
"""

from __future__ import annotations

from typing import Any, Literal

from app.harness.pipeline import PreToolDecision, ToolExec
from app.tools.schema import openai_tools

InteractionMode = Literal["agent"]


def normalize_interaction_mode(raw: str | None) -> InteractionMode:
    del raw
    return "agent"


def tools_for_interaction_mode(
    mode: str | None,
    *,
    engineer_mode: str | None = None,
    ssh_session_id: str | None = None,
    target: str | None = None,
) -> list[dict[str, Any]]:
    del mode
    if (target or "").strip().lower() == "local":
        from app.tools.schema import local_openai_tools

        return local_openai_tools()
    return openai_tools(engineer_mode=engineer_mode, ssh_session_id=ssh_session_id)


def interaction_mode_prompt_addendum(mode: str | None) -> str:
    del mode
    return (
        "Interaction mode: AGENT. Full investigate → approve → mutate → verify loop."
    )


def tool_allowed_in_mode(name: str, mode: str | None) -> bool:
    del name, mode
    return True


class InteractionModeGate:
    """Kept on the pipeline so older runs still have a hook. It does not deny."""

    def __init__(self, mode: str | None) -> None:
        self.mode = normalize_interaction_mode(mode if isinstance(mode, str) else None)

    async def pre(self, tool: ToolExec) -> PreToolDecision:
        del tool
        return PreToolDecision(action="allow")

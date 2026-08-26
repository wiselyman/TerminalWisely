"""InteractionMode (ask|plan|agent) — tool gates orthogonal to SecurityMode."""

from __future__ import annotations

from typing import Any, Literal

from app.harness.pipeline import PreToolDecision, ToolExec
from app.tools.schema import (
    TOOL_ASK_USER,
    TOOL_GREP_REMOTE_LOGS,
    TOOL_LIST_LISTENERS,
    TOOL_READ_REMOTE_FILE,
    TOOL_SERVICE_STATUS,
    TOOL_SPAWN_INVESTIGATOR,
    TOOL_SUBMIT_OPS_PLAN,
    TOOL_TERMINAL_EXEC,
    TOOL_UPDATE_PLAN,
    TOOL_WEB_FETCH,
    TOOL_WEB_SEARCH,
    openai_tools,
)

InteractionMode = Literal["ask", "plan", "agent"]

INTERACTION_MODES: tuple[str, ...] = ("ask", "plan", "agent")

_ASK_ALLOWED = frozenset(
    {
        TOOL_TERMINAL_EXEC,
        TOOL_WEB_SEARCH,
        TOOL_WEB_FETCH,
        TOOL_SERVICE_STATUS,
        TOOL_LIST_LISTENERS,
        TOOL_GREP_REMOTE_LOGS,
        TOOL_READ_REMOTE_FILE,
        TOOL_ASK_USER,
        TOOL_SPAWN_INVESTIGATOR,
        TOOL_UPDATE_PLAN,  # UI checklist OK in ask (no host mutation)
    }
)

_PLAN_ALLOWED = frozenset(
    {
        TOOL_UPDATE_PLAN,
        TOOL_WEB_SEARCH,
        TOOL_WEB_FETCH,
        TOOL_SERVICE_STATUS,
        TOOL_LIST_LISTENERS,
        TOOL_GREP_REMOTE_LOGS,
        TOOL_READ_REMOTE_FILE,
        TOOL_ASK_USER,
        TOOL_SPAWN_INVESTIGATOR,
    }
)


def normalize_interaction_mode(raw: str | None) -> InteractionMode:
    value = (raw or "agent").strip().lower()
    if value in INTERACTION_MODES:
        return value  # type: ignore[return-value]
    return "agent"


def allowed_tool_names(mode: InteractionMode) -> frozenset[str] | None:
    """None means all tools (agent)."""
    if mode == "ask":
        return _ASK_ALLOWED
    if mode == "plan":
        return _PLAN_ALLOWED
    return None


def tools_for_interaction_mode(mode: InteractionMode | str | None) -> list[dict[str, Any]]:
    m = normalize_interaction_mode(mode if isinstance(mode, str) else None)
    allowed = allowed_tool_names(m)
    if allowed is None:
        return openai_tools()
    return [
        t
        for t in openai_tools()
        if (t.get("function") or {}).get("name") in allowed
    ]


def interaction_mode_prompt_addendum(mode: InteractionMode | str | None) -> str:
    m = normalize_interaction_mode(mode if isinstance(mode, str) else None)
    if m == "ask":
        return (
            "Interaction mode: ASK. Investigate and explain only. "
            "Do not execute mutations or submit OpsPlans. "
            "Describe steps the user could take; prefer read-only tools."
        )
    if m == "plan":
        return (
            "Interaction mode: PLAN. Produce or update a checklist via update_plan. "
            "Do not run host mutations or submit_ops_plan. "
            "You may read the host and search the web for evidence."
        )
    return "Interaction mode: AGENT. Full investigate → approve → mutate → verify loop."


def tool_allowed_in_mode(name: str, mode: InteractionMode | str | None) -> bool:
    m = normalize_interaction_mode(mode if isinstance(mode, str) else None)
    allowed = allowed_tool_names(m)
    if allowed is None:
        return True
    # submit_ops_plan never in ask/plan
    if name == TOOL_SUBMIT_OPS_PLAN and m != "agent":
        return False
    if m == "plan" and name == TOOL_TERMINAL_EXEC:
        return False
    return name in allowed


class InteractionModeGate:
    """Pipeline pre-hook: deny tools disallowed by InteractionMode."""

    def __init__(self, mode: InteractionMode | str | None) -> None:
        self.mode = normalize_interaction_mode(mode if isinstance(mode, str) else None)

    async def pre(self, tool: ToolExec) -> PreToolDecision:
        if tool_allowed_in_mode(tool.name, self.mode):
            return PreToolDecision(action="allow")
        return PreToolDecision(
            action="deny",
            result={
                "ok": False,
                "denied": True,
                "_pipeline_deny": True,
                "error": (
                    f"Tool '{tool.name}' is not allowed in interaction mode "
                    f"'{self.mode}'."
                ),
                "_untrusted": True,
            },
        )

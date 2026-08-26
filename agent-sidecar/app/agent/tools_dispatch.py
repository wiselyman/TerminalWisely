"""Tool name → AgentLoop handler method (dispatch table)."""

from __future__ import annotations

from typing import Any, Awaitable, Callable, Protocol

from app.tools.linux_probe import (
    TOOL_GREP_REMOTE_LOGS,
    TOOL_LIST_LISTENERS,
    TOOL_READ_REMOTE_FILE,
    TOOL_SERVICE_STATUS,
)
from app.tools.schema import (
    TOOL_ASK_USER,
    TOOL_SPAWN_INVESTIGATOR,
    TOOL_SUBMIT_OPS_PLAN,
    TOOL_TERMINAL_EXEC,
    TOOL_UPDATE_PLAN,
    TOOL_WEB_FETCH,
    TOOL_WEB_SEARCH,
)

TOOL_HANDLER_METHODS: dict[str, str] = {
    TOOL_TERMINAL_EXEC: "_terminal_exec",
    TOOL_SUBMIT_OPS_PLAN: "_submit_ops_plan",
    TOOL_UPDATE_PLAN: "_update_plan",
    TOOL_WEB_SEARCH: "_web_search",
    TOOL_WEB_FETCH: "_web_fetch",
    TOOL_ASK_USER: "_ask_user",
    TOOL_SERVICE_STATUS: "_service_status",
    TOOL_LIST_LISTENERS: "_list_listeners",
    TOOL_GREP_REMOTE_LOGS: "_grep_remote_logs",
    TOOL_READ_REMOTE_FILE: "_read_remote_file",
    TOOL_SPAWN_INVESTIGATOR: "_spawn_investigator",
}

TOOLS_EMIT_CALL_EVENT_UPFRONT: frozenset[str] = frozenset(
    {
        TOOL_WEB_SEARCH,
        TOOL_WEB_FETCH,
        TOOL_SERVICE_STATUS,
        TOOL_LIST_LISTENERS,
        TOOL_GREP_REMOTE_LOGS,
        TOOL_READ_REMOTE_FILE,
    }
)


class ToolHandlerHost(Protocol):
    async def _terminal_exec(self, call_id: str, args: dict[str, Any]) -> None: ...
    async def _submit_ops_plan(self, call_id: str, args: dict[str, Any]) -> None: ...
    async def _update_plan(self, call_id: str, args: dict[str, Any]) -> None: ...
    async def _web_search(self, call_id: str, args: dict[str, Any]) -> None: ...
    async def _web_fetch(self, call_id: str, args: dict[str, Any]) -> None: ...
    async def _ask_user(self, call_id: str, args: dict[str, Any]) -> None: ...
    async def _service_status(self, call_id: str, args: dict[str, Any]) -> None: ...
    async def _list_listeners(self, call_id: str, args: dict[str, Any]) -> None: ...
    async def _grep_remote_logs(self, call_id: str, args: dict[str, Any]) -> None: ...
    async def _read_remote_file(self, call_id: str, args: dict[str, Any]) -> None: ...
    async def _spawn_investigator(self, call_id: str, args: dict[str, Any]) -> None: ...


def resolve_handler(
    host: ToolHandlerHost, name: str
) -> Callable[[str, dict[str, Any]], Awaitable[None]] | None:
    method_name = TOOL_HANDLER_METHODS.get(name)
    if not method_name:
        return None
    method = getattr(host, method_name, None)
    if method is None:
        return None
    return method  # type: ignore[return-value]


def known_tool_names() -> frozenset[str]:
    return frozenset(TOOL_HANDLER_METHODS)

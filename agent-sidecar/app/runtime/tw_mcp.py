"""TW MCP tool surface for external agent runtimes (in-process).

External agents (Cursor/Codex) call these tools for the *remote host plane*.
Execution goes through AgentLoop handlers → CommandBroker / research — never a
second SSH from Python.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from app.tools.schema import (
    TOOL_ASK_USER,
    TOOL_K8S_APPLY,
    TOOL_K8S_DELETE,
    TOOL_K8S_DESCRIBE,
    TOOL_K8S_EXEC,
    TOOL_K8S_GET,
    TOOL_K8S_LIST,
    TOOL_K8S_LOGS,
    TOOL_K8S_SCALE,
    TOOL_TERMINAL_EXEC,
    TOOL_WEB_FETCH,
    TOOL_WEB_SEARCH,
)

TW_MCP_SERVER_NAME = "terminalwisely"

# Remote-plane tools exposed to external agents (subset of full Builtin catalog).
_LINUX_TOOLS: tuple[str, ...] = (
    TOOL_TERMINAL_EXEC,
    TOOL_WEB_SEARCH,
    TOOL_WEB_FETCH,
    TOOL_ASK_USER,
)

_K8S_TOOLS: tuple[str, ...] = (
    TOOL_K8S_LIST,
    TOOL_K8S_GET,
    TOOL_K8S_DESCRIBE,
    TOOL_K8S_LOGS,
    TOOL_K8S_APPLY,
    TOOL_K8S_DELETE,
    TOOL_K8S_SCALE,
    TOOL_K8S_EXEC,
    TOOL_WEB_SEARCH,
    TOOL_WEB_FETCH,
    TOOL_ASK_USER,
)

_TOOL_DESCRIPTIONS: dict[str, str] = {
    TOOL_TERMINAL_EXEC: (
        "Run a command on the connected SSH session via TerminalWisely "
        "(CommandBroker + approval). Do not open a new SSH connection."
    ),
    TOOL_WEB_SEARCH: "Search the public web (untrusted DATA).",
    TOOL_WEB_FETCH: "Fetch a public http(s) URL (SSRF-guarded; untrusted DATA).",
    TOOL_ASK_USER: "Ask the human a clarification question (not mutation approval).",
    TOOL_K8S_LIST: "List Kubernetes resources in the selected cluster.",
    TOOL_K8S_GET: "Get a Kubernetes resource.",
    TOOL_K8S_DESCRIBE: "Describe a Kubernetes resource.",
    TOOL_K8S_LOGS: "Fetch pod logs.",
    TOOL_K8S_APPLY: "Apply Kubernetes YAML (requires TW approval when mutating).",
    TOOL_K8S_DELETE: "Delete a Kubernetes resource (requires TW approval).",
    TOOL_K8S_SCALE: "Scale a workload (requires TW approval).",
    TOOL_K8S_EXEC: "Short non-interactive kubectl exec.",
}


def tw_mcp_tool_names(*, engineer_mode: str | None = None) -> list[str]:
    mode = (engineer_mode or "linux").strip().lower()
    if mode == "k8s":
        return list(_K8S_TOOLS)
    return list(_LINUX_TOOLS)


def tw_mcp_list_tools(*, engineer_mode: str | None = None) -> list[dict[str, Any]]:
    """MCP-shaped tool descriptors (name + description + inputSchema stub)."""
    out: list[dict[str, Any]] = []
    for name in tw_mcp_tool_names(engineer_mode=engineer_mode):
        out.append(
            {
                "name": name,
                "description": _TOOL_DESCRIPTIONS.get(
                    name, f"TerminalWisely tool {name}"
                ),
                "inputSchema": {"type": "object", "additionalProperties": True},
            }
        )
    return out


def parse_tool_result_payload(content: str) -> dict[str, Any]:
    """Strip UNTRUSTED preamble and parse JSON tool body."""
    raw = (content or "").strip()
    if not raw:
        return {}
    # Tool messages are often: preamble + json
    brace = raw.find("{")
    bracket = raw.find("[")
    starts = [i for i in (brace, bracket) if i >= 0]
    if not starts:
        return {"ok": False, "error": "non-json tool result", "raw": raw[:500]}
    try:
        parsed = json.loads(raw[min(starts) :])
    except json.JSONDecodeError:
        return {"ok": False, "error": "invalid tool result json", "raw": raw[:500]}
    if isinstance(parsed, dict):
        return parsed
    return {"ok": True, "data": parsed}


class TwMcpServer:
    """In-process bridge: external agent → AgentLoop tool handlers."""

    def __init__(self, loop: Any) -> None:
        self._loop = loop

    @property
    def server_name(self) -> str:
        return TW_MCP_SERVER_NAME

    def list_tools(self) -> list[dict[str, Any]]:
        mode = str(self._loop.run.metadata.get("engineer_mode") or "linux")
        return tw_mcp_list_tools(engineer_mode=mode)

    async def call_tool(
        self,
        name: str,
        arguments: dict[str, Any] | None = None,
        *,
        call_id: str | None = None,
    ) -> dict[str, Any]:
        args = dict(arguments or {})
        allowed = {t["name"] for t in self.list_tools()}
        if name not in allowed:
            return {
                "ok": False,
                "error": f"Tool not exposed on TW MCP: {name}",
                "_untrusted": True,
            }
        cid = (call_id or "").strip() or f"mcp_{uuid.uuid4().hex[:12]}"
        tc = {
            "id": cid,
            "type": "function",
            "function": {
                "name": name,
                "arguments": json.dumps(args, ensure_ascii=False),
            },
        }
        await self._loop._handle_tool_call(tc)
        return self._result_for_call(cid)

    def _result_for_call(self, call_id: str) -> dict[str, Any]:
        run = self._loop.run
        for ev in reversed(run.events):
            if getattr(ev, "type", None) != "tool_result":
                continue
            payload = getattr(ev, "payload", None) or {}
            if str(payload.get("call_id") or "") != call_id:
                continue
            body = payload.get("payload")
            if isinstance(body, dict):
                return body
            return {"ok": True, "data": body}
        for msg in reversed(run.messages):
            if msg.get("role") != "tool":
                continue
            if str(msg.get("tool_call_id") or "") != call_id:
                continue
            return parse_tool_result_payload(str(msg.get("content") or ""))
        # Still waiting on host / user / approval — surface wait state.
        if run.pending_tool and run.pending_tool.call_id == call_id:
            return {
                "ok": False,
                "waiting": "tool",
                "call_id": call_id,
                "error": "awaiting_host",
                "_untrusted": True,
            }
        if run.pending_approval and getattr(run.pending_approval, "call_id", None) == call_id:
            return {
                "ok": False,
                "waiting": "approval",
                "call_id": call_id,
                "error": "awaiting_approval",
                "_untrusted": True,
            }
        if run.pending_user and getattr(run.pending_user, "call_id", None) == call_id:
            return {
                "ok": False,
                "waiting": "user",
                "call_id": call_id,
                "error": "awaiting_user",
                "_untrusted": True,
            }
        return {
            "ok": False,
            "error": "no tool result recorded",
            "call_id": call_id,
            "_untrusted": True,
        }

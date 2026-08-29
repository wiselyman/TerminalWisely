"""MCP server registry — builtin read-only ops sources + optional external."""

from __future__ import annotations

import json
import os
import shlex
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable

from app.mcp.client import MCPClient, client_from_command, client_from_handlers


@dataclass
class MCPServerSpec:
    id: str
    title: str
    read_only: bool = True
    tools: list[dict[str, Any]] = field(default_factory=list)
    factory: Callable[[], MCPClient] | None = None


HostBridgeFn = Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]


def _k8s_events_handlers(host_bridge: HostBridgeFn | None) -> dict[str, Any]:
    tools = [
        {
            "name": "namespace_events",
            "description": "List recent Kubernetes events in a namespace (read-only).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "namespace": {"type": "string"},
                    "limit": {"type": "integer", "default": 50},
                },
                "required": ["namespace"],
            },
        }
    ]

    def tools_list() -> dict[str, Any]:
        return {"tools": tools}

    async def tools_call(params: dict[str, Any]) -> dict[str, Any]:
        name = str(params.get("name") or "")
        args = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
        if name != "namespace_events":
            return {
                "content": [{"type": "text", "text": f"unknown tool: {name}"}],
                "isError": True,
            }
        ns = str(args.get("namespace") or "default")
        if host_bridge is None:
            return {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(
                            {
                                "namespace": ns,
                                "note": "host bridge unavailable in this context",
                                "events": [],
                            },
                            ensure_ascii=False,
                        ),
                    }
                ],
                "isError": False,
            }
        result = await host_bridge(
            "k8s_list",
            {"category": "events", "namespace": ns, "intent": "MCP namespace events"},
        )
        text = json.dumps(result, ensure_ascii=False)[:12000]
        return {"content": [{"type": "text", "text": text}], "isError": not result.get("ok", False)}

    return {"tools/list": tools_list, "tools/call": tools_call}


class MCPRegistry:
    def __init__(self) -> None:
        self._servers: dict[str, MCPServerSpec] = {}
        self._host_bridge: HostBridgeFn | None = None

    def set_host_bridge(self, fn: HostBridgeFn | None) -> None:
        self._host_bridge = fn
        handlers = _k8s_events_handlers(self._host_bridge)
        self._servers["tw-k8s-events"] = MCPServerSpec(
            id="tw-k8s-events",
            title="TerminalWisely K8s Events (read-only)",
            read_only=True,
            tools=handlers["tools/list"]()["tools"],
            factory=lambda: client_from_handlers(handlers),
        )

    def _ensure_builtins(self) -> None:
        if "tw-k8s-events" not in self._servers:
            self.set_host_bridge(self._host_bridge)

    def register_external_stdio(self, server_id: str, command: str, *, title: str = "") -> None:
        parts = shlex.split(command)
        if not parts:
            return
        self._servers[server_id] = MCPServerSpec(
            id=server_id,
            title=title or server_id,
            read_only=True,
            factory=lambda: client_from_command(parts),
        )

    def load_from_env(self) -> None:
        raw = (os.environ.get("TW_MCP_SERVERS") or "").strip()
        if not raw:
            return
        try:
            items = json.loads(raw)
        except json.JSONDecodeError:
            return
        if not isinstance(items, list):
            return
        for item in items:
            if not isinstance(item, dict):
                continue
            sid = str(item.get("id") or "").strip()
            cmd = str(item.get("command") or "").strip()
            if sid and cmd:
                self.register_external_stdio(
                    sid, cmd, title=str(item.get("title") or sid)
                )

    def list_servers(self) -> list[dict[str, Any]]:
        return [
            {
                "id": s.id,
                "title": s.title,
                "read_only": s.read_only,
                "tools": s.tools,
            }
            for s in self._servers.values()
        ]

    def get_client(self, server_id: str) -> MCPClient | None:
        spec = self._servers.get(server_id)
        if spec is None or spec.factory is None:
            return None
        return spec.factory()

    def is_read_only_tool(self, server_id: str, tool_name: str) -> bool:
        spec = self._servers.get(server_id)
        if spec is None or not spec.read_only:
            return False
        return any(t.get("name") == tool_name for t in spec.tools)


_REGISTRY = MCPRegistry()


def get_registry() -> MCPRegistry:
    reg = _REGISTRY
    reg._ensure_builtins()
    if not getattr(reg, "_env_loaded", False):
        reg.load_from_env()
        reg._env_loaded = True  # type: ignore[attr-defined]
    return reg

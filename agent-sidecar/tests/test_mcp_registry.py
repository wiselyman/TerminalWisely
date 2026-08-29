"""MCP registry and in-process client."""

from __future__ import annotations

import pytest

from app.mcp.client import client_from_handlers
from app.mcp.registry import get_registry


@pytest.mark.asyncio
async def test_inprocess_mcp_list_and_call() -> None:
    handlers = {
        "tools/list": lambda: {
            "tools": [{"name": "ping", "description": "ping", "inputSchema": {}}]
        },
        "tools/call": lambda params: {
            "content": [{"type": "text", "text": f"pong:{params.get('name')}"}],
            "isError": False,
        },
    }
    client = client_from_handlers(handlers)
    tools = await client.list_tools()
    assert tools[0]["name"] == "ping"
    out = await client.call_tool("ping", {})
    assert "pong" in out["content"][0]["text"]


def test_registry_lists_k8s_events_server() -> None:
    reg = get_registry()
    servers = reg.list_servers()
    ids = {s["id"] for s in servers}
    assert "tw-k8s-events" in ids
    assert reg.is_read_only_tool("tw-k8s-events", "namespace_events")

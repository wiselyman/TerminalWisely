"""Minimal MCP stdio server that forwards tools to the sidecar HTTP API.

Invoked by Cursor/Claude/Codex via mcpServers command. Speaks JSON-RPC on
stdin/stdout (Content-Length framing optional; NDJSON line protocol also
accepted for simplicity with Claude --mcp-config).
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from typing import Any

import httpx


def _sidecar_url() -> str:
    return (os.environ.get("TW_AI_SIDECAR_URL") or "http://127.0.0.1:8765").rstrip("/")


def _auth_headers() -> dict[str, str]:
    token = (os.environ.get("TW_AI_TOKEN") or "").strip()
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


async def _list_tools() -> list[dict[str, Any]]:
    run_id = os.environ.get("TW_AI_RUN_ID") or ""
    session_id = os.environ.get("TW_AI_SESSION_ID") or ""
    url = f"{_sidecar_url()}/v1/runs/{run_id}/mcp/tools"
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            url,
            headers=_auth_headers(),
            params={"session_id": session_id},
        )
        r.raise_for_status()
        data = r.json()
        return list(data.get("tools") or [])


async def _call_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    from app.runtime.tw_mcp import normalize_mcp_tool_name

    run_id = os.environ.get("TW_AI_RUN_ID") or ""
    session_id = os.environ.get("TW_AI_SESSION_ID") or ""
    url = f"{_sidecar_url()}/v1/runs/{run_id}/mcp/call"
    tool_name = normalize_mcp_tool_name(name)
    async with httpx.AsyncClient(timeout=600.0) as client:
        r = await client.post(
            url,
            headers=_auth_headers(),
            json={
                "session_id": session_id,
                "name": tool_name,
                "arguments": arguments or {},
            },
        )
        if r.status_code >= 400:
            return {"ok": False, "error": r.text[:500]}
        return r.json()


def _write_message(msg: dict[str, Any]) -> None:
    line = json.dumps(msg, ensure_ascii=False)
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


async def _handle(req: dict[str, Any]) -> None:
    method = str(req.get("method") or "")
    req_id = req.get("id")
    params = req.get("params") if isinstance(req.get("params"), dict) else {}

    if method == "initialize":
        _write_message(
            {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "terminalwisely", "version": "0.0.2"},
                },
            }
        )
        return
    if method == "notifications/initialized" or method.startswith("notifications/"):
        return
    if method == "tools/list":
        tools = await _list_tools()
        _write_message(
            {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {"tools": tools},
            }
        )
        return
    if method == "tools/call":
        name = str(params.get("name") or "")
        args = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
        result = await _call_tool(name, args)
        text = json.dumps(result, ensure_ascii=False)
        _write_message(
            {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{"type": "text", "text": text}],
                    "isError": result.get("ok") is False,
                },
            }
        )
        return
    if req_id is not None:
        _write_message(
            {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"},
            }
        )


async def main() -> None:
    loop = asyncio.get_event_loop()
    while True:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(req, dict):
            await _handle(req)


if __name__ == "__main__":
    asyncio.run(main())

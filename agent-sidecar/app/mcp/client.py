"""MCP read-only client with in-process and stdio transports."""

from __future__ import annotations

import asyncio
import json
import subprocess
from abc import ABC, abstractmethod
from typing import Any


class MCPClientError(RuntimeError):
    pass


class MCPTransport(ABC):
    @abstractmethod
    async def request(self, method: str, params: dict[str, Any] | None = None) -> Any:
        raise NotImplementedError


class InProcessMCPTransport(MCPTransport):
    """Call a Python handler dict directly (builtin servers)."""

    def __init__(self, handlers: dict[str, Any]) -> None:
        self._handlers = handlers

    async def request(self, method: str, params: dict[str, Any] | None = None) -> Any:
        params = params or {}
        if method == "initialize":
            return {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "in-process", "version": "1.0"},
            }
        if method == "tools/list":
            listing = self._handlers.get("tools/list")
            if callable(listing):
                result = listing()
                if asyncio.iscoroutine(result):
                    return await result
                return result
            return {"tools": []}
        if method == "tools/call":
            caller = self._handlers.get("tools/call")
            if not callable(caller):
                raise MCPClientError("tools/call not supported")
            result = caller(params)
            if asyncio.iscoroutine(result):
                return await result
            return result
        raise MCPClientError(f"unsupported MCP method: {method}")


class StdioMCPTransport(MCPTransport):
    """Minimal JSON-RPC over stdio for external MCP servers."""

    def __init__(self, command: list[str], *, cwd: str | None = None) -> None:
        self._command = command
        self._cwd = cwd
        self._proc: subprocess.Popen[str] | None = None
        self._lock = asyncio.Lock()
        self._next_id = 1

    async def _ensure_proc(self) -> subprocess.Popen[str]:
        if self._proc is not None and self._proc.poll() is None:
            return self._proc
        self._proc = subprocess.Popen(
            self._command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=self._cwd,
        )
        return self._proc

    async def request(self, method: str, params: dict[str, Any] | None = None) -> Any:
        async with self._lock:
            proc = await self._ensure_proc()
            assert proc.stdin is not None and proc.stdout is not None
            req_id = self._next_id
            self._next_id += 1
            payload = {
                "jsonrpc": "2.0",
                "id": req_id,
                "method": method,
                "params": params or {},
            }
            proc.stdin.write(json.dumps(payload) + "\n")
            proc.stdin.flush()
            line = proc.stdout.readline()
            if not line.strip():
                raise MCPClientError("MCP server closed stdout")
            resp = json.loads(line)
            if "error" in resp:
                raise MCPClientError(str(resp["error"]))
            return resp.get("result")


class MCPClient:
    def __init__(self, transport: MCPTransport) -> None:
        self._transport = transport
        self._initialized = False

    async def initialize(self) -> None:
        if self._initialized:
            return
        await self._transport.request("initialize", {})
        self._initialized = True

    async def list_tools(self) -> list[dict[str, Any]]:
        await self.initialize()
        result = await self._transport.request("tools/list", {})
        tools = result.get("tools") if isinstance(result, dict) else None
        if not isinstance(tools, list):
            return []
        return [t for t in tools if isinstance(t, dict)]

    async def call_tool(
        self, name: str, arguments: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        await self.initialize()
        result = await self._transport.request(
            "tools/call",
            {"name": name, "arguments": arguments or {}},
        )
        if not isinstance(result, dict):
            raise MCPClientError(f"unexpected tool result: {type(result).__name__}")
        return result


def client_from_command(command: list[str], *, cwd: str | None = None) -> MCPClient:
    return MCPClient(StdioMCPTransport(command, cwd=cwd))


def client_from_handlers(handlers: dict[str, Any]) -> MCPClient:
    return MCPClient(InProcessMCPTransport(handlers))

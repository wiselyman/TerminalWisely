"""User-attached MCP servers. Tool results are untrusted data.

The client starts only the configured server process. It never runs a tool
argument as a local shell command.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class UserMcpServer:
    name: str
    command: str
    args: tuple[str, ...]
    env: tuple[tuple[str, str], ...] = ()


def _parse_env(raw: Any) -> tuple[tuple[str, str], ...]:
    if not isinstance(raw, dict):
        return ()
    out: list[tuple[str, str]] = []
    for key, value in raw.items():
        if value is None:
            continue
        out.append((str(key), str(value)))
    return tuple(out)


def load_user_mcp_config(text: str) -> list[UserMcpServer]:
    try:
        payload = json.loads(text or "{}")
    except json.JSONDecodeError:
        return []
    if not isinstance(payload, dict):
        return []
    servers = payload.get("mcpServers")
    if not isinstance(servers, dict):
        return []
    out: list[UserMcpServer] = []
    for name, spec in servers.items():
        if not isinstance(spec, dict):
            continue
        command = str(spec.get("command") or "").strip()
        if not command:
            continue
        raw_args = spec.get("args") or []
        args = tuple(str(item) for item in raw_args) if isinstance(raw_args, list) else ()
        out.append(
            UserMcpServer(
                name=str(name),
                command=command,
                args=args,
                env=_parse_env(spec.get("env")),
            )
        )
    return out


def resolve_user_mcp_servers(metadata_value: Any, file_text: str | None) -> list[UserMcpServer]:
    listed = servers_from_metadata(metadata_value)
    if listed:
        return listed
    if not file_text:
        return []
    return load_user_mcp_config(file_text)


def servers_from_metadata(raw: Any) -> list[UserMcpServer]:
    if not isinstance(raw, list):
        return []
    out: list[UserMcpServer] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        command = str(item.get("command") or "").strip()
        name = str(item.get("name") or "").strip()
        if not command or not name:
            continue
        raw_args = item.get("args") or []
        args = tuple(str(part) for part in raw_args) if isinstance(raw_args, list) else ()
        out.append(
            UserMcpServer(
                name=name,
                command=command,
                args=args,
                env=_parse_env(item.get("env")),
            )
        )
    return out


class UserMcpClient:
    def __init__(
        self,
        command: str,
        args: list[str] | tuple[str, ...],
        env: dict[str, str] | None = None,
    ) -> None:
        import os

        proc_env = os.environ.copy()
        if env:
            proc_env.update(env)
        self._proc = subprocess.Popen(
            [command, *args],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            env=proc_env,
        )
        self._next_id = 0
        self._tools: list[dict[str, Any]] | None = None
        self._request("initialize", {"protocolVersion": "2024-11-05", "capabilities": {}})

    def close(self) -> None:
        if self._proc.poll() is None:
            self._proc.kill()
            try:
                self._proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                pass

    def list_tools(self) -> list[dict[str, Any]]:
        if self._tools is None:
            result = self._request("tools/list", {})
            tools = result.get("tools") if isinstance(result, dict) else None
            self._tools = [item for item in tools if isinstance(item, dict)] if isinstance(tools, list) else []
        return list(self._tools)

    def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        result = self._request(
            "tools/call",
            {"name": name, "arguments": arguments or {}},
        )
        if isinstance(result, dict):
            body = dict(result)
        else:
            body = {"data": result}
        body["_untrusted"] = True
        return body

    def _request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        self._next_id += 1
        message = {
            "jsonrpc": "2.0",
            "id": self._next_id,
            "method": method,
            "params": params,
        }
        if self._proc.stdin is None or self._proc.stdout is None:
            raise RuntimeError("MCP server pipes are closed")
        self._proc.stdin.write(json.dumps(message) + "\n")
        self._proc.stdin.flush()
        line = self._proc.stdout.readline()
        if not line:
            raise RuntimeError("MCP server closed the stream")
        payload = json.loads(line)
        if not isinstance(payload, dict):
            raise RuntimeError("MCP server returned a non-object")
        if payload.get("error"):
            raise RuntimeError(str(payload.get("error")))
        result = payload.get("result")
        return result if isinstance(result, dict) else {"data": result}

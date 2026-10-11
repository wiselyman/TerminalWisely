"""User MCP servers stay data-only and unnamed."""

from __future__ import annotations

import json
import subprocess
import sys

from app.runtime.user_mcp import UserMcpClient, load_user_mcp_config


FAKE_SERVER = """
import json, sys
for line in sys.stdin:
    if not line.strip():
        continue
    req = json.loads(line)
    method = req.get("method")
    rid = req.get("id")
    if method == "initialize":
        result = {"protocolVersion": "2024-11-05", "capabilities": {}}
    elif method == "tools/list":
        result = {"tools": [{"name": "sample_tool", "description": "sample", "inputSchema": {"type": "object"}}]}
    elif method == "tools/call":
        result = {"content": [{"type": "text", "text": "sample-ok"}]}
    else:
        result = {}
    if rid is not None:
        sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": rid, "result": result}) + "\\n")
        sys.stdout.flush()
"""


def test_metadata_servers_win_over_a_config_file() -> None:
    from app.runtime.user_mcp import resolve_user_mcp_servers

    resolved = resolve_user_mcp_servers(
        [{"name": "from-run", "command": "tool", "args": []}],
        json.dumps({"mcpServers": {"from-file": {"command": "other"}}}),
    )
    assert [item.name for item in resolved] == ["from-run"]


def test_config_ignores_servers_without_a_command() -> None:
    loaded = load_user_mcp_config(
        json.dumps(
            {
                "mcpServers": {
                    "kept": {"command": "tool", "args": ["a"]},
                    "dropped": {"args": ["no-command"]},
                }
            }
        )
    )
    assert [item.name for item in loaded] == ["kept"]
    assert load_user_mcp_config("{}") == []
    assert load_user_mcp_config("not-json") == []


def test_config_keeps_env_and_client_passes_it(tmp_path, monkeypatch) -> None:
    loaded = load_user_mcp_config(
        json.dumps(
            {
                "mcpServers": {
                    "with-env": {
                        "command": "tool",
                        "args": [],
                        "env": {"APP_ID": "cli_x"},
                    }
                }
            }
        )
    )
    assert loaded[0].env == (("APP_ID", "cli_x"),)

    script = tmp_path / "fake_mcp.py"
    script.write_text(FAKE_SERVER, encoding="utf-8")
    seen: list[dict] = []
    real = subprocess.Popen

    def wrapped(argv, *args, **kwargs):  # type: ignore[no-untyped-def]
        seen.append(kwargs.get("env") or {})
        return real(argv, *args, **kwargs)

    monkeypatch.setattr(subprocess, "Popen", wrapped)
    client = UserMcpClient(sys.executable, [str(script)], env={"APP_ID": "cli_x"})
    try:
        client.list_tools()
    finally:
        client.close()
    assert seen and seen[0].get("APP_ID") == "cli_x"


def test_call_tool_is_untrusted_and_does_not_spawn_a_second_process(tmp_path, monkeypatch) -> None:
    script = tmp_path / "fake_mcp.py"
    script.write_text(FAKE_SERVER, encoding="utf-8")
    calls: list[list[str]] = []
    real = subprocess.Popen

    def wrapped(argv, *args, **kwargs):  # type: ignore[no-untyped-def]
        calls.append([str(part) for part in argv])
        return real(argv, *args, **kwargs)

    monkeypatch.setattr(subprocess, "Popen", wrapped)
    client = UserMcpClient(sys.executable, [str(script)])
    try:
        tools = client.list_tools()
        assert tools[0]["name"] == "sample_tool"
        result = client.call_tool("sample_tool", {"note": "do-not-run"})
    finally:
        client.close()
    assert result["_untrusted"] is True
    assert result["content"][0]["text"] == "sample-ok"
    assert len(calls) == 1
    joined = " ".join(calls[0])
    assert "do-not-run" not in joined

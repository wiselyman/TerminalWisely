"""Unit tests for Cursor/Claude stream-json → TW event mapping."""

from __future__ import annotations

import json
from pathlib import Path

from app.runtime.cli_host import (
    _parse_stream_line,
    build_cli_argv,
    write_tw_mcp_config,
)


def test_parse_ignores_thinking_and_system() -> None:
    assert _parse_stream_line("cursor", json.dumps({"type": "thinking", "text": "x"})) == []
    assert _parse_stream_line("cursor", json.dumps({"type": "system", "subtype": "init"})) == []


def test_parse_cursor_tool_call_shell_started() -> None:
    line = json.dumps(
        {
            "type": "tool_call",
            "subtype": "started",
            "tool_call": {
                "shellToolCall": {
                    "args": {"command": "uptime", "workingDirectory": ""},
                }
            },
        }
    )
    evs = _parse_stream_line("cursor", line)
    assert len(evs) == 1
    assert evs[0]["type"] == "external_tool_activity"
    assert evs[0]["name"] == "cursor.shell"
    assert evs[0]["detail"] == "uptime"


def test_parse_cursor_tool_call_skips_empty_and_completed() -> None:
    empty = json.dumps(
        {"type": "tool_call", "subtype": "started", "tool_call": {"shellToolCall": {"args": {}}}}
    )
    assert _parse_stream_line("cursor", empty) == []
    # Legacy bad shape that produced cursor.tool + {}
    legacy = json.dumps({"type": "tool_call", "name": None, "input": {}})
    assert _parse_stream_line("cursor", legacy) == []
    completed = json.dumps(
        {
            "type": "tool_call",
            "subtype": "completed",
            "tool_call": {
                "shellToolCall": {"args": {"command": "uptime"}},
            },
        }
    )
    assert _parse_stream_line("cursor", completed) == []


def test_parse_assistant_and_result_no_duplicate() -> None:
    asst = json.dumps(
        {
            "type": "assistant",
            "message": {
                "role": "assistant",
                "content": [{"type": "text", "text": "主机已开机 3 小时"}],
            },
        }
    )
    evs = _parse_stream_line("cursor", asst)
    assert evs == [{"type": "assistant_delta", "text": "主机已开机 3 小时"}]
    # result must not re-append glued text
    result = json.dumps(
        {
            "type": "result",
            "subtype": "success",
            "result": "主机已开机 3 小时主机已开机 3 小时",
        }
    )
    assert _parse_stream_line("cursor", result) == [{"type": "done"}]


def test_write_tw_mcp_also_writes_cursor_and_codex_project_mcp(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setenv("TW_AI_TOKEN", "tok")
    monkeypatch.setenv("TW_AI_SIDECAR_URL", "http://127.0.0.1:8765")
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("USERPROFILE", str(home))
    user_mcp = home / ".cursor" / "mcp.json"
    user_mcp.parent.mkdir(parents=True)
    user_mcp.write_text(
        json.dumps({"mcpServers": {"other": {"command": "echo"}}}),
        encoding="utf-8",
    )

    class R:
        run_id = "r1"
        session_id = "s1"

    cfg = write_tw_mcp_config(R(), tmp_path)
    assert cfg.name == "tw_mcp.json"
    tw = json.loads(cfg.read_text(encoding="utf-8"))
    server = tw["mcpServers"]["terminalwisely"]
    # Claude --mcp-config ignores user/project files. Print mode only connects
    # servers marked alwaysLoad, and the schema expects type stdio.
    assert server["type"] == "stdio"
    assert server["alwaysLoad"] is True
    claude_project = tmp_path / ".mcp.json"
    assert json.loads(claude_project.read_text(encoding="utf-8"))["mcpServers"][
        "terminalwisely"
    ]["command"]
    cursor_mcp = tmp_path / ".cursor" / "mcp.json"
    assert cursor_mcp.is_file()
    data = json.loads(cursor_mcp.read_text(encoding="utf-8"))
    assert "terminalwisely" in data["mcpServers"]
    # Cursor has no --mcp-config. A temp workspace whose git root is elsewhere
    # skips project mcp.json, so the same server must be merged into the user file.
    user = json.loads(user_mcp.read_text(encoding="utf-8"))
    assert user["mcpServers"]["other"]["command"] == "echo"
    assert user["mcpServers"]["terminalwisely"]["command"] == server["command"]
    codex_toml = tmp_path / ".codex" / "config.toml"
    assert codex_toml.is_file()
    text = codex_toml.read_text(encoding="utf-8")
    assert "[mcp_servers.terminalwisely]" in text
    assert "command" in text


def test_cursor_user_mcp_keeps_unparseable_file(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    user_mcp = tmp_path / ".cursor" / "mcp.json"
    user_mcp.parent.mkdir(parents=True)
    raw = "{not json"
    user_mcp.write_text(raw, encoding="utf-8")

    class R:
        run_id = "r1"
        session_id = "s1"

    ws = tmp_path / "ws"
    ws.mkdir()
    write_tw_mcp_config(R(), ws)
    assert user_mcp.read_text(encoding="utf-8") == raw


def test_cursor_argv_has_trust_force_no_partial(monkeypatch, tmp_path: Path) -> None:
    from app.runtime.local_cli import ResolvedCli

    binary = str(tmp_path / "cursor-agent")
    monkeypatch.setattr(
        "app.runtime.cli_host.resolve_local_cli",
        lambda kind: ResolvedCli(kind="cursor", binary=binary, argv_prefix=[binary]),
    )
    argv = build_cli_argv(
        "cursor",
        prompt="hi",
        workspace=tmp_path,
        mcp_config=tmp_path / "tw_mcp.json",
    )
    assert "--trust" in argv
    assert "-f" in argv
    assert "--approve-mcps" in argv
    assert "--stream-partial-output" not in argv
    assert "--output-format" in argv


def test_claude_argv_stream_json_requires_verbose(monkeypatch, tmp_path: Path) -> None:
    from app.runtime.local_cli import ResolvedCli

    binary = str(tmp_path / "claude")
    monkeypatch.setattr(
        "app.runtime.cli_host.resolve_local_cli",
        lambda kind: ResolvedCli(kind="claude", binary=binary, argv_prefix=[binary]),
    )
    argv = build_cli_argv(
        "claude",
        prompt="hi",
        workspace=tmp_path,
        mcp_config=tmp_path / "tw_mcp.json",
    )
    assert "-p" in argv
    assert argv[argv.index("--output-format") + 1] == "stream-json"
    assert "--verbose" in argv
    assert "--include-partial-messages" in argv
    assert "--strict-mcp-config" in argv
    # Headless must not block on Claude's own MCP permission prompts.
    assert argv[argv.index("--permission-mode") + 1] == "bypassPermissions"


def test_codex_argv_skips_git_repo_check(monkeypatch, tmp_path: Path) -> None:
    """TW agent workspaces are temp dirs — Codex requires --skip-git-repo-check."""
    from app.runtime.local_cli import ResolvedCli

    binary = str(tmp_path / "codex")
    monkeypatch.setattr(
        "app.runtime.cli_host.resolve_local_cli",
        lambda kind: ResolvedCli(kind="codex", binary=binary, argv_prefix=[binary]),
    )
    argv = build_cli_argv(
        "codex",
        prompt="hi",
        workspace=tmp_path,
        mcp_config=tmp_path / "tw_mcp.json",
    )
    assert argv[:2] == [binary, "exec"]
    assert "--json" in argv
    assert "--cd" in argv
    assert "--skip-git-repo-check" in argv
    assert "--ephemeral" not in argv
    assert "--approve-for-me" in argv
    assert "--disable" in argv
    assert "computer_use" in argv
    # Project .codex/config.toml is ignored on untrusted temp dirs (Windows included).
    # MCP must be passed with -c so Codex registers server terminalwisely.
    mcp = tmp_path / "tw_mcp.json"
    mcp.write_text(
        '{"mcpServers":{"terminalwisely":{"command":"python","args":["-m","app.runtime.mcp_stdio"],"env":{"TW_AI_TOKEN":"tok"}}}}',
        encoding="utf-8",
    )
    argv = build_cli_argv(
        "codex",
        prompt="hi",
        workspace=tmp_path,
        mcp_config=mcp,
    )
    joined = " ".join(argv)
    assert "mcp_servers.terminalwisely.command" in joined
    assert "mcp_servers.terminalwisely.args" in joined
    assert "-s" not in argv
    assert "workspace-write" not in argv
    assert argv[-1] == "hi"


def test_parse_codex_agent_message_and_turn_done() -> None:
    line = json.dumps(
        {
            "type": "item.completed",
            "item": {"id": "item_0", "type": "agent_message", "text": "华硕 / MSI"},
        }
    )
    evs = _parse_stream_line("codex", line)
    assert evs == [{"type": "assistant_message", "text": "华硕 / MSI"}]
    done = _parse_stream_line(
        "codex", json.dumps({"type": "turn.completed", "usage": {}})
    )
    assert done == [{"type": "done"}]
    assert _parse_stream_line("codex", json.dumps({"type": "thread.started"})) == []


def test_parse_codex_command_execution_started() -> None:
    line = json.dumps(
        {
            "type": "item.started",
            "item": {
                "id": "item_0",
                "type": "command_execution",
                "command": "lspci -nnk",
                "status": "in_progress",
            },
        }
    )
    evs = _parse_stream_line("codex", line)
    assert len(evs) == 1
    assert evs[0]["type"] == "external_tool_activity"
    assert evs[0]["name"] == "codex.command_execution"
    assert evs[0]["detail"] == "lspci -nnk"
    # completed repeats — skip
    done_line = json.dumps(
        {
            "type": "item.completed",
            "item": {
                "id": "item_0",
                "type": "command_execution",
                "command": "lspci -nnk",
                "status": "completed",
                "exit_code": 0,
            },
        }
    )
    assert _parse_stream_line("codex", done_line) == []


def test_parse_cursor_mcp_tool_call() -> None:
    line = json.dumps(
        {
            "type": "tool_call",
            "subtype": "started",
            "tool_call": {
                "mcpToolCall": {
                    "args": {
                        "name": "terminalwisely-terminal_exec",
                        "args": {"command": "uptime"},
                        "toolName": "terminal_exec",
                        "serverIdentifier": "terminalwisely",
                    }
                }
            },
        }
    )
    evs = _parse_stream_line("cursor", line)
    assert len(evs) == 1
    assert evs[0]["name"] == "cursor.terminal_exec"
    assert evs[0]["detail"] == "uptime"


def test_parse_skips_get_mcp_tools() -> None:
    line = json.dumps(
        {
            "type": "tool_call",
            "subtype": "started",
            "tool_call": {
                "getMcpToolsToolCall": {
                    "args": {"server": "terminalwisely", "toolName": "terminal_exec"}
                }
            },
        }
    )
    assert _parse_stream_line("cursor", line) == []

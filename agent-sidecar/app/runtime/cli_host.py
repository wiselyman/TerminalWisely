"""Shared local-CLI host: spawn cursor/codex/claude --print and stream events."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import sys
from pathlib import Path
from typing import Any

from app.agent.loop import AgentLoop
from app.runtime.fakes import FakeCodexDriver, FakeCursorDriver, FakeResearch
from app.runtime.local_cli import (
    LocalCliKind,
    explicit_fake_env,
    probe_local_cli,
    resolve_local_cli,
)
from app.runtime.tw_mcp import TwMcpServer, tw_mcp_list_tools
from app.runtime.workspace import agent_workspace_dir
from app.session.attachments import content_as_plain_text
from app.state import RunStatus

logger = logging.getLogger("agent-sidecar.cli_host")

_REMOTE_PLANE_ADDENDUM = (
    "[TerminalWisely remote plane] The connected SSH/K8s host is reached only "
    "through TerminalWisely MCP tools (terminal_exec, web_search, web_fetch, "
    "ask_user, k8s_*). Do not open a new SSH login to that host."
)


class _SilentModel:
    async def chat_completions(self, messages, tools=None, **kwargs):  # type: ignore[no-untyped-def]
        return {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "",
                        "tool_calls": [],
                    }
                }
            ]
        }

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return completion["choices"][0]["message"]


def sidecar_public_url() -> str:
    return (os.environ.get("TW_AI_SIDECAR_URL") or "http://127.0.0.1:8765").rstrip("/")


def write_tw_mcp_config(run: Any, workspace: Path) -> Path:
    """Write Claude/Cursor-compatible MCP config for this run."""
    cfg_path = workspace / "tw_mcp.json"
    py = sys.executable
    sidecar_root = Path(__file__).resolve().parents[2]
    existing_pp = os.environ.get("PYTHONPATH") or ""
    pythonpath = (
        str(sidecar_root)
        if not existing_pp
        else f"{sidecar_root}{os.pathsep}{existing_pp}"
    )
    env = {
        "TW_AI_TOKEN": os.environ.get("TW_AI_TOKEN") or "",
        "TW_AI_SIDECAR_URL": sidecar_public_url(),
        "TW_AI_RUN_ID": str(run.run_id),
        "TW_AI_SESSION_ID": str(run.session_id),
        "TW_AI_DATA_DIR": os.environ.get("TW_AI_DATA_DIR") or "",
        "PYTHONPATH": pythonpath,
    }
    payload = {
        "mcpServers": {
            "terminalwisely": {
                "command": py,
                "args": ["-m", "app.runtime.mcp_stdio"],
                "env": env,
                "cwd": str(sidecar_root),
            }
        }
    }
    cfg_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return cfg_path


def build_cli_argv(
    kind: LocalCliKind,
    *,
    prompt: str,
    workspace: Path,
    mcp_config: Path,
) -> list[str]:
    resolved = resolve_local_cli(kind)
    if resolved is None:
        raise RuntimeError("install_needed")
    prefix = list(resolved.argv_prefix)
    if kind == "cursor":
        return [
            *prefix,
            "-p",
            "--output-format",
            "stream-json",
            "--stream-partial-output",
            "--workspace",
            str(workspace),
            "--approve-mcps",
            # Cursor may pick MCP from project; pass prompt with addendum.
            prompt,
        ]
    if kind == "claude":
        return [
            *prefix,
            "-p",
            "--output-format",
            "stream-json",
            "--include-partial-messages",
            "--mcp-config",
            str(mcp_config),
            "--strict-mcp-config",
            prompt,
        ]
    # codex — best-effort non-interactive
    return [
        *prefix,
        "exec",
        "--json",
        "--cd",
        str(workspace),
        prompt,
    ]


def _parse_stream_line(kind: LocalCliKind, line: str) -> list[dict[str, Any]]:
    """Map CLI NDJSON / stream-json lines to internal event dicts."""
    raw = line.strip()
    if not raw:
        return []
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        # Plain text fallback
        return [{"type": "assistant_delta", "text": raw + "\n"}]
    if not isinstance(obj, dict):
        return []

    events: list[dict[str, Any]] = []
    # Claude stream-json shapes
    t = str(obj.get("type") or obj.get("event") or "")
    if t in {"assistant", "message"} or obj.get("role") == "assistant":
        content = obj.get("content") or obj.get("message") or obj.get("text") or ""
        if isinstance(content, list):
            texts = []
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    texts.append(str(part.get("text") or ""))
                elif isinstance(part, str):
                    texts.append(part)
            content = "".join(texts)
        if content:
            events.append({"type": "assistant_delta", "text": str(content)})
        return events
    if t in {"content_block_delta", "assistant_delta"}:
        delta = obj.get("delta") if isinstance(obj.get("delta"), dict) else {}
        text = delta.get("text") or obj.get("text") or ""
        if text:
            events.append({"type": "assistant_delta", "text": str(text)})
        return events
    if t in {"tool_use", "tool_call", "mcp_tool_call"}:
        name = str(
            obj.get("name")
            or (obj.get("tool") or {}).get("name")
            or "tool"
        )
        events.append(
            {
                "type": "external_tool_activity",
                "name": f"{kind}.{name}",
                "detail": json.dumps(obj.get("input") or obj.get("arguments") or {})[
                    :400
                ],
            }
        )
        return events
    if t in {"result", "done", "message_stop"}:
        result_text = obj.get("result") or obj.get("text") or ""
        if result_text:
            events.append({"type": "assistant_message", "text": str(result_text)})
        events.append({"type": "done"})
        return events
    # Cursor stream-json: often {type:"assistant", message:{content:[{type:text,text:}]}}
    msg = obj.get("message")
    if isinstance(msg, dict):
        content = msg.get("content")
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text" and part.get("text"):
                    events.append(
                        {"type": "assistant_delta", "text": str(part["text"])}
                    )
        elif isinstance(content, str) and content:
            events.append({"type": "assistant_delta", "text": content})
    # Bare text field
    if not events and isinstance(obj.get("text"), str) and obj["text"]:
        events.append({"type": "assistant_delta", "text": obj["text"]})
    return events


class LocalCliHost:
    """Drive one external local CLI for a run."""

    def __init__(self, kind: LocalCliKind) -> None:
        self.kind: LocalCliKind = kind
        self._proc: asyncio.subprocess.Process | None = None
        self._active_driver: Any | None = None

    def probe(self) -> dict[str, Any]:
        return probe_local_cli(self.kind)

    def cancel(self, run: Any) -> None:
        run.cancel_requested = True
        d = self._active_driver
        if d is not None and hasattr(d, "cancel"):
            d.cancel()
        proc = self._proc
        if proc and proc.returncode is None:
            try:
                if sys.platform != "win32":
                    os.killpg(proc.pid, signal.SIGTERM)
                else:
                    proc.terminate()
            except (ProcessLookupError, OSError):
                try:
                    proc.terminate()
                except ProcessLookupError:
                    pass

    async def start(self, run: Any, user_message: Any) -> None:
        kind = self.kind
        run.metadata["runtime"] = kind
        cwd = agent_workspace_dir(run)
        run.metadata["agent_workspace"] = str(cwd)
        run.append_event(
            "status",
            {"phase": "thinking", "runtime": kind, "cwd": str(cwd)},
        )
        run.status = RunStatus.RUNNING

        if explicit_fake_env(kind):
            await self._run_fake(run, user_message)
            return

        probe = probe_local_cli(kind)
        if not probe.get("installed"):
            run.status = RunStatus.FAILED
            run.append_event(
                "error",
                {
                    "code": "install_needed",
                    "message": f"{kind} CLI not found on PATH. Install from {probe.get('install_url')}",
                    "install_url": probe.get("install_url"),
                    "runtime": kind,
                },
            )
            return

        # Tool host for MCP HTTP bridge (approvals / remote exec).
        tool_loop = AgentLoop(run, model=_SilentModel())
        mcp = TwMcpServer(tool_loop)
        run.metadata["_tw_mcp"] = mcp
        mcp_cfg = write_tw_mcp_config(run, cwd)

        plain = content_as_plain_text(user_message)
        if not plain.strip():
            plain = str(user_message or "")
        prompt = f"{_REMOTE_PLANE_ADDENDUM}\n\n{plain}"

        try:
            argv = build_cli_argv(
                kind, prompt=prompt, workspace=cwd, mcp_config=mcp_cfg
            )
        except RuntimeError:
            run.status = RunStatus.FAILED
            run.append_event(
                "error",
                {
                    "code": "install_needed",
                    "message": f"{kind} CLI disappeared from PATH",
                    "runtime": kind,
                },
            )
            return

        run.append_event(
            "external_tool_activity",
            {
                "name": f"{kind}.cli",
                "detail": " ".join(argv[:6]) + (" …" if len(argv) > 6 else ""),
                "runtime": kind,
            },
        )

        assistant_buf = ""
        try:
            self._proc = await asyncio.create_subprocess_exec(
                *argv,
                cwd=str(cwd),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                start_new_session=(sys.platform != "win32"),
                env={**os.environ},
            )
            assert self._proc.stdout is not None
            while True:
                if run.cancel_requested:
                    self.cancel(run)
                    run.status = RunStatus.CANCELLED
                    run.append_event("cancelled", {"reason": "user_stop"})
                    return
                line_b = await self._proc.stdout.readline()
                if not line_b:
                    break
                line = line_b.decode("utf-8", errors="replace")
                for ev in _parse_stream_line(kind, line):
                    et = ev.get("type")
                    if et == "assistant_delta":
                        text = str(ev.get("text") or "")
                        assistant_buf += text
                        run.append_event("assistant_delta", {"text": text})
                    elif et == "assistant_message":
                        text = str(ev.get("text") or "")
                        assistant_buf += text
                        run.append_message({"role": "assistant", "content": text})
                        run.append_event("assistant_message", {"content": text})
                    elif et == "external_tool_activity":
                        run.append_event(
                            "external_tool_activity",
                            {
                                "name": ev.get("name"),
                                "detail": ev.get("detail"),
                                "ok": ev.get("ok"),
                                "runtime": kind,
                            },
                        )
                    elif et == "done":
                        break
            stderr = ""
            if self._proc.stderr:
                err_b = await self._proc.stderr.read()
                stderr = err_b.decode("utf-8", errors="replace")[:2000]
            code = await self._proc.wait()
            if run.cancel_requested:
                run.status = RunStatus.CANCELLED
                return
            if code not in (0, None) and not assistant_buf:
                run.status = RunStatus.FAILED
                run.append_event(
                    "error",
                    {
                        "message": f"{kind} CLI exited {code}: {stderr or 'no output'}",
                        "runtime": kind,
                    },
                )
                return
        except Exception as exc:  # noqa: BLE001
            logger.exception("%s CLI host failed", kind)
            run.status = RunStatus.FAILED
            run.append_event("error", {"message": str(exc), "runtime": kind})
            return
        finally:
            self._proc = None
            run.metadata.pop("_tw_mcp", None)

        if run.status == RunStatus.RUNNING:
            if assistant_buf and not any(
                m.get("role") == "assistant" for m in run.messages
            ):
                run.append_message({"role": "assistant", "content": assistant_buf})
            run.status = RunStatus.COMPLETED
            run.append_event("status", {"status": "completed", "runtime": kind})

    async def _run_fake(self, run: Any, user_message: Any) -> None:
        research = FakeResearch()
        tool_loop = AgentLoop(run, model=_SilentModel(), research=research)
        mcp = TwMcpServer(tool_loop)
        if self.kind == "codex":
            driver: Any = FakeCodexDriver()
        elif self.kind == "claude":
            driver = FakeCursorDriver(
                reply="Claude fake: done.",
                activity_prefix="claude",
            )
        else:
            driver = FakeCursorDriver()
        self._active_driver = driver
        plain = content_as_plain_text(user_message) or str(user_message or "")
        prompt = f"{_REMOTE_PLANE_ADDENDUM}\n\n{plain}"

        async def call_mcp(name: str, args: dict[str, Any]) -> dict[str, Any]:
            return await mcp.call_tool(name, args)

        assistant_buf = ""
        try:
            async for ev in driver.run(prompt, call_mcp=call_mcp):
                if run.cancel_requested:
                    run.status = RunStatus.CANCELLED
                    run.append_event("cancelled", {"reason": "user_stop"})
                    return
                et = ev.get("type")
                if et == "assistant_delta":
                    text = str(ev.get("text") or "")
                    assistant_buf += text
                    run.append_event("assistant_delta", {"text": text})
                elif et == "assistant_message":
                    text = str(ev.get("text") or "")
                    assistant_buf += text
                    run.append_message({"role": "assistant", "content": text})
                    run.append_event("assistant_message", {"content": text})
                elif et == "external_tool_activity":
                    run.append_event(
                        "external_tool_activity",
                        {
                            "name": ev.get("name"),
                            "detail": ev.get("detail"),
                            "ok": ev.get("ok"),
                            "runtime": self.kind,
                        },
                    )
                elif et == "cancelled":
                    run.status = RunStatus.CANCELLED
                    return
                elif et == "done":
                    break
        finally:
            self._active_driver = None
        if run.status == RunStatus.RUNNING:
            if assistant_buf and not any(
                m.get("role") == "assistant" for m in run.messages
            ):
                run.append_message({"role": "assistant", "content": assistant_buf})
            run.status = RunStatus.COMPLETED
            run.append_event(
                "status", {"status": "completed", "runtime": self.kind}
            )


# Silence unused import lint for list_tools (used by HTTP handlers via tw_mcp).
_ = tw_mcp_list_tools

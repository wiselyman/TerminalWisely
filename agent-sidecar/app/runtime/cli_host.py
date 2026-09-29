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
from app.runtime.cli_session import (
    build_runtime_argv,
    remember_vendor_session,
    resume_attempt_accepted,
    stored_vendor_session_id,
    text_rejects_resume,
    vendor_session_is_stale,
)
from app.runtime.continuity_pack import (
    prior_evidence_present,
    render_continuity_pack,
    render_current_turn,
)
from app.runtime.fakes import FakeCodexDriver, FakeCursorDriver, FakeResearch
from app.runtime.local_cli import (
    LocalCliKind,
    LOGIN_HINTS,
    cli_spawn_env,
    explicit_fake_env,
    looks_like_auth_failure,
    prepare_cli_argv,
    probe_local_cli,
    resolve_local_cli,
)
from app.runtime.tw_mcp import TwMcpServer, tw_mcp_list_tools
from app.runtime.workspace import agent_workspace_dir
from app.runtime.remote_plane import (
    is_local_desktop_impersonation,
    write_remote_plane_guidance,
)
from app.session.attachments import content_as_plain_text
from app.state import RunStatus

logger = logging.getLogger("agent-sidecar.cli_host")


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


def _tw_mcp_server_payload(run: Any) -> dict[str, Any]:
    py = sys.executable
    sidecar_root = Path(__file__).resolve().parents[2]
    existing_pp = os.environ.get("PYTHONPATH") or ""
    pythonpath = (
        str(sidecar_root)
        if not existing_pp
        else f"{sidecar_root}{os.pathsep}{existing_pp}"
    )
    return {
        "command": py,
        "args": ["-m", "app.runtime.mcp_stdio"],
        "env": {
            "TW_AI_TOKEN": os.environ.get("TW_AI_TOKEN") or "",
            "TW_AI_SIDECAR_URL": sidecar_public_url(),
            "TW_AI_RUN_ID": str(run.run_id),
            "TW_AI_SESSION_ID": str(run.session_id),
            "TW_AI_DATA_DIR": os.environ.get("TW_AI_DATA_DIR") or "",
            "PYTHONPATH": pythonpath,
        },
        "cwd": str(sidecar_root),
    }


def write_tw_mcp_config(run: Any, workspace: Path) -> Path:
    """Write MCP config for Claude / Cursor / Codex project layouts."""
    server = _tw_mcp_server_payload(run)
    payload = {"mcpServers": {"terminalwisely": server}}
    cfg_path = workspace / "tw_mcp.json"
    cfg_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    # Cursor Agent reads project MCP from <workspace>/.cursor/mcp.json
    cursor_dir = workspace / ".cursor"
    cursor_dir.mkdir(parents=True, exist_ok=True)
    (cursor_dir / "mcp.json").write_text(
        json.dumps(payload, indent=2), encoding="utf-8"
    )
    # Codex loads project MCP from <workspace>/.codex/config.toml
    codex_dir = workspace / ".codex"
    codex_dir.mkdir(parents=True, exist_ok=True)
    cmd = str(server.get("command") or "")
    args = server.get("args") or []
    env = server.get("env") if isinstance(server.get("env"), dict) else {}
    lines = [
        # Hard-disable local desktop/CUA in project config (client Mac ≠ remote host).
        "[features]",
        "computer_use = false",
        "",
        "[mcp_servers.terminalwisely]",
        f'command = {json.dumps(cmd)}',
        "args = [",
    ]
    for a in args:
        lines.append(f"  {json.dumps(str(a))},")
    lines.append("]")
    if env:
        lines.append("")
        lines.append("[mcp_servers.terminalwisely.env]")
        for k, v in env.items():
            lines.append(f'{k} = {json.dumps(str(v))}')
    lines.append("")
    (codex_dir / "config.toml").write_text("\n".join(lines), encoding="utf-8")
    write_remote_plane_guidance(workspace)
    return cfg_path


def build_cli_argv(
    kind: LocalCliKind,
    *,
    prompt: str,
    workspace: Path,
    mcp_config: Path,
    resume_id: str | None = None,
) -> list[str]:
    resolved = resolve_local_cli(kind)
    if resolved is None:
        raise RuntimeError("install_needed")
    # Cursor: no --stream-partial-output (partials duplicate the final chunk).
    # --trust / -f: headless workspace trust and MCP tool calls.
    # Codex: --approve-for-me implies workspace-write — do not also pass -s.
    # --disable computer_use blocks local desktop/CUA. No --ephemeral.
    return build_runtime_argv(
        kind,
        prefix=list(resolved.argv_prefix),
        prompt=prompt,
        workspace=workspace,
        mcp_config=mcp_config,
        resume_id=resume_id,
    )


def _cursor_tool_from_payload(tool_call: dict[str, Any]) -> tuple[str, str, bool | None]:
    """Extract (name, detail, ok) from Cursor stream-json tool_call.tool_call object."""
    # Known wrappers: shellToolCall, mcpToolCall, functionToolCall, …
    for key, body in tool_call.items():
        if key in {"hookAdditionalContexts", "toolCallId", "startedAtMs", "completedAtMs"}:
            continue
        if not isinstance(body, dict):
            continue
        raw_name = key
        if raw_name.endswith("ToolCall"):
            raw_name = raw_name[: -len("ToolCall")]
        raw_name = raw_name[0].lower() + raw_name[1:] if raw_name else "tool"
        # Skip Cursor internal MCP introspection noise.
        if raw_name.lower() in {"getmcptools", "listmcptools"}:
            return "", "", None
        args = body.get("args") if isinstance(body.get("args"), dict) else {}
        # Nested MCP args: { toolName, args: { command }, name: "server-tool" }
        nested = args.get("args") if isinstance(args.get("args"), dict) else {}
        mcp_name = (
            args.get("toolName")
            or body.get("name")
            or args.get("tool")
            or args.get("name")
        )
        if isinstance(mcp_name, str) and mcp_name.strip():
            name = mcp_name.strip()
            # Cursor often prefixes: terminalwisely-terminal_exec
            if "-" in name:
                maybe = name.rsplit("-", 1)[-1]
                if maybe and maybe != name:
                    name = maybe
        else:
            name = raw_name
        detail_obj: Any = nested or args
        if isinstance(nested, dict) and nested:
            if "command" in nested:
                detail_obj = nested.get("command")
            elif "query" in nested:
                detail_obj = nested.get("query")
            else:
                detail_obj = nested
        elif "command" in args:
            detail_obj = args.get("command")
        elif "query" in args:
            detail_obj = args.get("query")
        elif not args and body.get("result") is not None:
            detail_obj = body.get("result")
        if isinstance(detail_obj, (dict, list)):
            detail = json.dumps(detail_obj, ensure_ascii=False)[:400]
        else:
            detail = str(detail_obj or "")[:400]
        ok: bool | None = None
        if "result" in body or "error" in body:
            ok = body.get("error") in (None, "", False)
        return name, detail.strip(), ok
    return "", "", None


def _vendor_session_events(kind: LocalCliKind, obj: dict[str, Any]) -> list[dict[str, Any]]:
    """Session id carried on a stream object, if this runtime reports one."""
    if kind == "codex":
        raw_id = obj.get("thread_id")
    else:
        raw_id = obj.get("session_id")
    if not isinstance(raw_id, str) or not raw_id.strip():
        return []
    return [{"type": "vendor_session", "session_id": raw_id.strip()}]


def _parse_stream_line(kind: LocalCliKind, line: str) -> list[dict[str, Any]]:
    """Map CLI NDJSON / stream-json lines to internal event dicts."""
    raw = line.strip()
    if not raw:
        return []
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        if text_rejects_resume(raw):
            return [{"type": "resume_rejected", "text": raw}]
        return [{"type": "assistant_delta", "text": raw + "\n"}]
    if not isinstance(obj, dict):
        return []

    t = str(obj.get("type") or obj.get("event") or "")
    vendor_events = _vendor_session_events(kind, obj)
    # Noise / lifecycle — never treat as chat text or tool cards.
    if t in {
        "system",
        "user",
        "thinking",
        "thread.started",
        "turn.started",
    }:
        return vendor_events

    events: list[dict[str, Any]] = []

    # Codex exec --json: item.started / item.completed / turn.completed
    if t in {"item.started", "item.completed", "item.updated"}:
        item = obj.get("item") if isinstance(obj.get("item"), dict) else {}
        item_type = str(item.get("type") or "")
        if item_type == "agent_message":
            text = str(item.get("text") or item.get("content") or "")
            if text.strip():
                # Final agent_message on item.completed; treat as authoritative.
                if t == "item.completed":
                    events.append({"type": "assistant_message", "text": text})
                else:
                    events.append({"type": "assistant_delta", "text": text})
            return events
        if item_type in {
            "command_execution",
            "mcp_tool_call",
            "tool_call",
            "web_search",
            "file_change",
            "js",
            "js_repl",
            "code_execution",
            "computer_use",
            "cua",
        }:
            # One activity card when the item starts (or completes if no start).
            if t == "item.completed" and item_type == "command_execution":
                # Prefer started card; completed repeats the same command.
                if str(item.get("status") or "") == "completed":
                    return []
            name = item_type
            if item_type == "mcp_tool_call":
                name = str(
                    item.get("tool")
                    or item.get("name")
                    or item.get("tool_name")
                    or "mcp"
                )
            detail = (
                item.get("command")
                or item.get("query")
                or item.get("code")
                or item.get("input")
                or item.get("arguments")
                or item.get("path")
                or ""
            )
            if isinstance(detail, (dict, list)):
                detail = json.dumps(detail, ensure_ascii=False)[:400]
            detail_s = str(detail or "")[:400].strip()
            # Prefer structured code+title payloads when present.
            if not detail_s or detail_s in {"{}", "null", "[]"}:
                code = item.get("code")
                title = item.get("title")
                if code or title:
                    detail_s = json.dumps(
                        {"code": code, "title": title},
                        ensure_ascii=False,
                    )[:400]
            if not detail_s or detail_s in {"{}", "null", "[]"}:
                return []
            activity_name = f"{kind}.{name}"
            # Hard UI suppress: local desktop/CUA must not look like remote-host evidence.
            if is_local_desktop_impersonation(name=activity_name, detail=detail_s):
                return []
            ok: bool | None = None
            if item.get("exit_code") is not None:
                try:
                    ok = int(item.get("exit_code")) == 0
                except (TypeError, ValueError):
                    ok = None
            events.append(
                {
                    "type": "external_tool_activity",
                    "name": activity_name,
                    "detail": detail_s,
                    "ok": ok,
                }
            )
            return events
        return []

    if t == "turn.completed":
        events.append({"type": "done"})
        return events

    # Cursor: {type:"tool_call", subtype:"started"|"completed", tool_call:{shellToolCall:{…}}}
    if t == "tool_call":
        subtype = str(obj.get("subtype") or "")
        # One card per call — only on started (completed repeats the same args).
        if subtype and subtype != "started":
            return []
        tool_body = obj.get("tool_call")
        if not isinstance(tool_body, dict):
            return []
        name, detail, ok = _cursor_tool_from_payload(tool_body)
        if not name or name == "tool":
            return []
        if not detail or detail in {"{}", "null", "[]"}:
            return []
        activity_name = f"{kind}.{name}"
        if is_local_desktop_impersonation(name=activity_name, detail=detail):
            return []
        events.append(
            {
                "type": "external_tool_activity",
                "name": activity_name,
                "detail": detail,
                "ok": ok,
            }
        )
        return events

    # Claude / generic tool shapes
    if t in {"tool_use", "mcp_tool_call"}:
        name = str(
            obj.get("name")
            or (obj.get("tool") or {}).get("name")
            or ""
        ).strip()
        if not name:
            return []
        detail_raw = obj.get("input") or obj.get("arguments") or {}
        detail = (
            json.dumps(detail_raw, ensure_ascii=False)[:400]
            if isinstance(detail_raw, (dict, list))
            else str(detail_raw)[:400]
        )
        if not detail or detail in {"{}", "null", "[]"}:
            return []
        activity_name = f"{kind}.{name}"
        if is_local_desktop_impersonation(name=activity_name, detail=detail):
            return []
        events.append(
            {
                "type": "external_tool_activity",
                "name": activity_name,
                "detail": detail,
            }
        )
        return events

    if t in {"assistant", "message"} or obj.get("role") == "assistant":
        content = obj.get("content") or obj.get("message") or obj.get("text") or ""
        if isinstance(obj.get("message"), dict) and not isinstance(content, (str, list)):
            content = obj["message"].get("content") or ""
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

    if t in {"result", "done", "message_stop"}:
        # Cursor result.result often concatenates prior assistant chunks — do not
        # re-append as a new message (causes duplicated / glued answers).
        events = list(vendor_events)
        if obj.get("is_error") is True or str(obj.get("subtype") or "") == "error":
            events.append(
                {
                    "type": "resume_rejected",
                    "text": str(obj.get("result") or obj.get("error") or ""),
                }
            )
        events.append({"type": "done"})
        return events

    # Cursor stream-json: {type:"assistant", message:{content:[{type:text,text:}]}}
    # already handled above. Leftover message/text fallbacks:
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
        return events


class _CliAttempt:
    def __init__(self) -> None:
        self.assistant = ""
        self.vendor_ids: list[str] = []
        self.reject_text = ""
        self.rejected = False
        self.auth_failure = False
        self.failed = False
        self.cancelled = False


class _Fold:
    def __init__(self) -> None:
        self.confirmed = False
        self.miss = False
        self.done = False
        self.emit: list[dict[str, Any]] = []


def _turn_prompts(
    run: Any, kind: str, plain: str, workspace: Path
) -> tuple[str, str | None, str | None]:
    """Return (first prompt, resume id or None, pack prompt if resume can miss)."""
    prior = list(run.messages)
    resume_id = stored_vendor_session_id(run, kind)
    current = render_current_turn(plain)
    pack = render_continuity_pack(prior, current_plain=plain, workspace=workspace)
    # Other model/agent turns (or mid-run context) after this vendor bind mean
    # the CLI thread is behind TW SessionLog — do not resume; rebuild from pack.
    if resume_id and vendor_session_is_stale(run, kind):
        resume_id = None
    if resume_id:
        return current, resume_id, pack
    # No usable vendor id. Prior SessionLog evidence is the only memory — start
    # a fresh CLI session with the pack so a later resume is not an empty thread.
    if prior_evidence_present(prior):
        return pack, None, None
    return current, None, None


def _fold_stream_events(
    attempt: _CliAttempt,
    parsed: list[dict[str, Any]],
    staged: list[dict[str, Any]],
    *,
    confirmed: bool,
    resume_id: str | None,
    kind: str,
) -> _Fold:
    """Buffer a resume until the CLI echoes a usable session id."""
    content: list[dict[str, Any]] = []
    fold = _Fold()
    fold.confirmed = confirmed
    for ev in parsed:
        et = ev.get("type")
        if et == "vendor_session":
            sid = str(ev.get("session_id") or "").strip()
            if sid:
                attempt.vendor_ids.append(sid)
        elif et == "resume_rejected":
            extra = str(ev.get("text") or "")
            attempt.reject_text = f"{attempt.reject_text}\n{extra}".strip()
            attempt.rejected = True
        elif et == "done":
            fold.done = True
        else:
            content.append(ev)
    if attempt.rejected:
        fold.miss = True
        return fold
    if (
        resume_id
        and attempt.vendor_ids
        and not resume_attempt_accepted(
            kind, resume_id, attempt.vendor_ids, reject_text=attempt.reject_text
        )
    ):
        attempt.rejected = True
        fold.miss = True
        return fold
    if resume_id and not confirmed and resume_attempt_accepted(
        kind, resume_id, attempt.vendor_ids, reject_text=attempt.reject_text
    ):
        fold.confirmed = True
        fold.emit = [*staged, *content]
        staged.clear()
        return fold
    if fold.confirmed:
        fold.emit = content
    else:
        staged.extend(content)
    return fold


def _emit_stream_event(
    run: Any,
    attempt: _CliAttempt,
    ev: dict[str, Any],
    kind: str,
    *,
    replace_assistant: bool,
) -> None:
    et = ev.get("type")
    if et == "assistant_delta":
        text = str(ev.get("text") or "")
        attempt.assistant += text
        run.append_event("assistant_delta", {"text": text})
    elif et == "assistant_message":
        text = str(ev.get("text") or "")
        if not text.strip():
            return
        if replace_assistant:
            attempt.assistant = text
        else:
            attempt.assistant += text
        run.append_message({"role": "assistant", "content": text})
        payload: dict[str, Any] = {"content": text}
        if replace_assistant:
            payload["replace"] = True
        run.append_event("assistant_message", payload)
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
    elif et == "cancelled":
        run.status = RunStatus.CANCELLED


def _resume_miss(kind: str, requested: str, attempt: _CliAttempt) -> bool:
    if attempt.auth_failure or attempt.failed or attempt.cancelled:
        return False
    if attempt.rejected or text_rejects_resume(attempt.reject_text):
        return True
    return not resume_attempt_accepted(
        kind, requested, attempt.vendor_ids, reject_text=attempt.reject_text
    )


def _remember_kept_session(
    run: Any,
    kind: str,
    attempt: _CliAttempt,
    *,
    requested_resume: str | None,
) -> None:
    if attempt.rejected or attempt.failed or attempt.cancelled or not attempt.vendor_ids:
        return
    if requested_resume and not resume_attempt_accepted(
        kind,
        requested_resume,
        attempt.vendor_ids,
        reject_text=attempt.reject_text,
    ):
        return
    remember_vendor_session(run, kind, attempt.vendor_ids[-1])


def _commit_assistant_tail(run: Any, assistant_buf: str, kind: str) -> None:
    if assistant_buf.strip():
        msgs = run.messages
        last = msgs[-1] if msgs else None
        already = (
            isinstance(last, dict)
            and last.get("role") == "assistant"
            and str(last.get("content") or "") == assistant_buf
        )
        if not already:
            run.append_message({"role": "assistant", "content": assistant_buf})
        run.append_event(
            "assistant_message",
            {"content": assistant_buf, "replace": True},
        )
    run.status = RunStatus.COMPLETED
    run.append_event("status", {"status": "completed", "runtime": kind})


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
                    "login_hint": probe.get("login_hint"),
                    "runtime": kind,
                },
            )
            return
        if probe.get("code") == "login_needed" or probe.get("authenticated") is False:
            hint = probe.get("login_hint") or LOGIN_HINTS.get(kind, "")
            run.status = RunStatus.FAILED
            run.append_event(
                "error",
                {
                    "code": "login_needed",
                    "message": (
                        f"{kind} CLI is installed but not logged in. {hint}"
                    ),
                    "install_url": probe.get("install_url"),
                    "login_hint": hint,
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
        # Build prompts before appending this turn so it is not duplicated.
        first_prompt, first_resume, fallback_prompt = _turn_prompts(
            run, self.kind, plain, cwd
        )
        run.append_message({"role": "user", "content": plain})

        attempt: _CliAttempt | None = None
        try:
            try:
                attempt = await self._spawn_attempt(
                    run, cwd, mcp_cfg, first_prompt, resume_id=first_resume
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
            if attempt.cancelled or attempt.failed:
                return
            kept_resume: str | None = first_resume
            if (
                first_resume
                and fallback_prompt is not None
                and _resume_miss(self.kind, first_resume, attempt)
            ):
                try:
                    attempt = await self._spawn_attempt(
                        run, cwd, mcp_cfg, fallback_prompt, resume_id=None
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
                if attempt.cancelled or attempt.failed:
                    return
                kept_resume = None
            if run.status == RunStatus.RUNNING:
                _commit_assistant_tail(run, attempt.assistant, kind)
                _remember_kept_session(
                    run, kind, attempt, requested_resume=kept_resume
                )
        finally:
            run.metadata.pop("_tw_mcp", None)

    async def _spawn_attempt(
        self,
        run: Any,
        cwd: Path,
        mcp_cfg: Path,
        prompt: str,
        *,
        resume_id: str | None,
    ) -> "_CliAttempt":
        kind = self.kind
        argv = build_cli_argv(
            kind,
            prompt=prompt,
            workspace=cwd,
            mcp_config=mcp_cfg,
            resume_id=resume_id,
        )
        attempt = _CliAttempt()
        staged: list[dict[str, Any]] = []
        confirmed = resume_id is None
        run.append_event(
            "external_tool_activity",
            {
                "name": f"{kind}.cli",
                "detail": " ".join(argv[:6]) + (" …" if len(argv) > 6 else ""),
                "runtime": kind,
            },
        )
        try:
            self._proc = await asyncio.create_subprocess_exec(
                *prepare_cli_argv(argv),
                cwd=str(cwd),
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                start_new_session=(sys.platform != "win32"),
                env=cli_spawn_env(),
            )
            assert self._proc.stdout is not None
            stream_done = False
            while True:
                if run.cancel_requested:
                    self.cancel(run)
                    run.status = RunStatus.CANCELLED
                    run.append_event("cancelled", {"reason": "user_stop"})
                    attempt.cancelled = True
                    return attempt
                line_b = await self._proc.stdout.readline()
                if not line_b:
                    break
                line = line_b.decode("utf-8", errors="replace")
                action = _fold_stream_events(
                    attempt,
                    _parse_stream_line(kind, line),
                    staged,
                    confirmed=confirmed,
                    resume_id=resume_id,
                    kind=kind,
                )
                confirmed = action.confirmed
                if action.miss:
                    attempt.rejected = True
                    self._terminate_proc()
                    proc = self._proc
                    if proc is not None:
                        try:
                            await asyncio.wait_for(proc.wait(), timeout=2.0)
                        except (TimeoutError, asyncio.TimeoutError):
                            self._kill_proc()
                    return attempt
                if action.emit:
                    for ev in action.emit:
                        _emit_stream_event(run, attempt, ev, kind, replace_assistant=True)
                if action.done:
                    stream_done = True
                    self._terminate_proc()
                    break
            stderr = ""
            if self._proc.stderr:
                try:
                    err_b = await asyncio.wait_for(self._proc.stderr.read(), timeout=2.0)
                    stderr = err_b.decode("utf-8", errors="replace")[:2000]
                except (TimeoutError, asyncio.TimeoutError):
                    stderr = ""
            if text_rejects_resume(stderr):
                attempt.reject_text = (
                    f"{attempt.reject_text}\n{stderr}".strip()
                )
                if not confirmed:
                    attempt.rejected = True
                    return attempt
            if resume_id and not confirmed:
                if resume_attempt_accepted(
                    kind,
                    resume_id,
                    attempt.vendor_ids,
                    reject_text=attempt.reject_text,
                ):
                    for ev in staged:
                        _emit_stream_event(
                            run, attempt, ev, kind, replace_assistant=True
                        )
                    confirmed = True
                else:
                    attempt.rejected = True
                    return attempt
            try:
                code = await asyncio.wait_for(self._proc.wait(), timeout=5.0)
            except (TimeoutError, asyncio.TimeoutError):
                self._kill_proc()
                try:
                    code = await asyncio.wait_for(self._proc.wait(), timeout=2.0)
                except (TimeoutError, asyncio.TimeoutError):
                    code = -1
            if stream_done and code not in (0, None) and attempt.assistant.strip():
                code = 0
            if run.cancel_requested:
                run.status = RunStatus.CANCELLED
                attempt.cancelled = True
                return attempt
            if attempt.rejected:
                return attempt
            if code not in (0, None) and not attempt.assistant:
                self._fail_cli(run, code, stderr)
                attempt.failed = True
                attempt.auth_failure = looks_like_auth_failure(stderr)
                return attempt
            if code not in (0, None) and looks_like_auth_failure(stderr):
                self._fail_cli(run, code, stderr, auth=True)
                attempt.failed = True
                attempt.auth_failure = True
                return attempt
        except Exception as exc:  # noqa: BLE001
            logger.exception("%s CLI host failed", kind)
            run.status = RunStatus.FAILED
            run.append_event("error", {"message": str(exc), "runtime": kind})
            attempt.failed = True
            return attempt
        finally:
            self._proc = None
        return attempt

    def _terminate_proc(self) -> None:
        proc = self._proc
        if proc is None or proc.returncode is not None:
            return
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

    def _kill_proc(self) -> None:
        proc = self._proc
        if proc is None or proc.returncode is not None:
            return
        try:
            if sys.platform != "win32":
                os.killpg(proc.pid, signal.SIGKILL)
            else:
                proc.kill()
        except (ProcessLookupError, OSError):
            pass

    def _fail_cli(
        self,
        run: Any,
        code: int | None,
        stderr: str,
        *,
        auth: bool | None = None,
    ) -> None:
        kind = self.kind
        is_auth = looks_like_auth_failure(stderr) if auth is None else auth
        hint = LOGIN_HINTS.get(kind, "")
        run.status = RunStatus.FAILED
        run.append_event(
            "error",
            {
                "code": "login_needed" if is_auth else "cli_failed",
                "message": (
                    f"{kind} CLI not logged in. {hint}"
                    if is_auth
                    else f"{kind} CLI exited {code}: {stderr or 'no output'}"
                ),
                "login_hint": hint if is_auth else "",
                "runtime": kind,
            },
        )

    async def _run_fake(self, run: Any, user_message: Any) -> None:
        research = FakeResearch()
        tool_loop = AgentLoop(run, model=_SilentModel(), research=research)
        mcp = TwMcpServer(tool_loop)
        if self.kind == "codex":
            driver: Any = FakeCodexDriver()
        elif self.kind == "claude":
            driver = FakeCursorDriver(
                reply="[ci-stub] claude ok",
                activity_prefix="claude",
            )
        else:
            driver = FakeCursorDriver(reply="[ci-stub] cursor ok")
        self._active_driver = driver
        cwd = agent_workspace_dir(run)
        plain = content_as_plain_text(user_message) or str(user_message or "")
        first_prompt, first_resume, fallback_prompt = _turn_prompts(
            run, self.kind, plain, cwd
        )
        run.append_message({"role": "user", "content": plain})

        async def call_mcp(name: str, args: dict[str, Any]) -> dict[str, Any]:
            return await mcp.call_tool(name, args)

        try:
            attempt = await self._consume_fake(
                run, driver, first_prompt, call_mcp, resume_id=first_resume
            )
            if attempt.cancelled or run.status == RunStatus.CANCELLED:
                return
            kept_resume: str | None = first_resume
            if (
                first_resume
                and fallback_prompt is not None
                and _resume_miss(self.kind, first_resume, attempt)
            ):
                attempt = await self._consume_fake(
                    run, driver, fallback_prompt, call_mcp, resume_id=None
                )
                if attempt.cancelled or run.status == RunStatus.CANCELLED:
                    return
                kept_resume = None
        finally:
            self._active_driver = None
        if run.status == RunStatus.RUNNING:
            _commit_assistant_tail(run, attempt.assistant, self.kind)
            _remember_kept_session(
                run, self.kind, attempt, requested_resume=kept_resume
            )

    async def _consume_fake(
        self,
        run: Any,
        driver: Any,
        prompt: str,
        call_mcp: Any,
        *,
        resume_id: str | None,
    ) -> _CliAttempt:
        attempt = _CliAttempt()
        staged: list[dict[str, Any]] = []
        confirmed = resume_id is None
        async for ev in driver.run(prompt, call_mcp=call_mcp):
            if run.cancel_requested:
                run.status = RunStatus.CANCELLED
                run.append_event("cancelled", {"reason": "user_stop"})
                attempt.cancelled = True
                return attempt
            action = _fold_stream_events(
                attempt,
                [ev],
                staged,
                confirmed=confirmed,
                resume_id=resume_id,
                kind=self.kind,
            )
            confirmed = action.confirmed
            if action.miss:
                attempt.rejected = True
                return attempt
            for item in action.emit:
                _emit_stream_event(
                    run, attempt, item, self.kind, replace_assistant=False
                )
            if action.done:
                break
        if resume_id and not confirmed:
            if resume_attempt_accepted(
                self.kind,
                resume_id,
                attempt.vendor_ids,
                reject_text=attempt.reject_text,
            ):
                for item in staged:
                    _emit_stream_event(
                        run, attempt, item, self.kind, replace_assistant=False
                    )
            else:
                attempt.rejected = True
        return attempt


# Silence unused import lint for list_tools (used by HTTP handlers via tw_mcp).
_ = tw_mcp_list_tools

"""Guided local-CLI login (Cursor / Codex / Claude) for TW UI — no manual terminal."""

from __future__ import annotations

import asyncio
import logging
import os
import re
import signal
import sys
from dataclasses import dataclass, field
from typing import Any

from app.runtime.local_cli import (
    LocalCliKind,
    cli_spawn_env,
    prepare_cli_argv,
    probe_local_cli,
    resolve_local_cli,
)

logger = logging.getLogger("agent-sidecar.cli_login")

_URL_RE = re.compile(r"https?://[^\s<>\"']+")


@dataclass
class LoginSession:
    kind: LocalCliKind
    phase: str = "idle"  # idle|starting|waiting_browser|succeeded|failed|cancelled
    url: str = ""
    detail: str = ""
    exit_code: int | None = None
    _proc: asyncio.subprocess.Process | None = field(default=None, repr=False)
    _task: asyncio.Task[None] | None = field(default=None, repr=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)


_SESSIONS: dict[str, LoginSession] = {}


def login_argv(kind: LocalCliKind) -> list[str]:
    resolved = resolve_local_cli(kind)
    if resolved is None:
        raise RuntimeError("install_needed")
    prefix = list(resolved.argv_prefix)
    if kind == "cursor":
        return [*prefix, "login"]
    if kind == "claude":
        return [*prefix, "auth", "login"]
    return [*prefix, "login"]


def _extract_url(text: str) -> str:
    for m in _URL_RE.finditer(text or ""):
        u = m.group(0).rstrip(").,;]'\"")
        low = u.lower()
        if any(
            x in low
            for x in (
                "login",
                "auth",
                "oauth",
                "challenge",
                "device",
                "cli",
                "deepcontrol",
            )
        ):
            return u
    m = _URL_RE.search(text or "")
    return m.group(0).rstrip(").,;]'\"") if m else ""


def get_login_status(kind: LocalCliKind) -> dict[str, Any]:
    sess = _SESSIONS.get(kind)
    if sess is None:
        return {
            "kind": kind,
            "phase": "idle",
            "url": "",
            "detail": "",
            "exit_code": None,
        }
    return {
        "kind": kind,
        "phase": sess.phase,
        "url": sess.url,
        "detail": sess.detail,
        "exit_code": sess.exit_code,
    }


async def cancel_login(kind: LocalCliKind) -> dict[str, Any]:
    sess = _SESSIONS.get(kind)
    if sess is None:
        return get_login_status(kind)
    async with sess._lock:
        sess.phase = "cancelled"
        sess.detail = "cancelled"
        proc = sess._proc
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
        task = sess._task
        if task and not task.done():
            task.cancel()
    return get_login_status(kind)


async def start_login(kind: LocalCliKind) -> dict[str, Any]:
    """Start CLI login; wait briefly for a browser URL, return status for the UI."""
    probe = probe_local_cli(kind)
    if probe.get("fake"):
        return {
            "kind": kind,
            "phase": "succeeded",
            "url": "",
            "detail": "fake",
            "exit_code": 0,
        }
    if not probe.get("installed"):
        raise RuntimeError("install_needed")
    if probe.get("authenticated") and probe.get("code") == "ready":
        return {
            "kind": kind,
            "phase": "succeeded",
            "url": "",
            "detail": "already_authenticated",
            "exit_code": 0,
        }

    existing = _SESSIONS.get(kind)
    if existing and existing.phase in {"starting", "waiting_browser"}:
        return get_login_status(kind)

    argv = prepare_cli_argv(login_argv(kind))
    sess = LoginSession(kind=kind, phase="starting", detail="starting")
    _SESSIONS[kind] = sess

    env = cli_spawn_env()
    # TW opens the URL itself so the panel can show guided copy.
    env["NO_OPEN_BROWSER"] = "1"

    sess._proc = await asyncio.create_subprocess_exec(
        *argv,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        start_new_session=(sys.platform != "win32"),
        env=env,
    )
    sess._task = asyncio.create_task(_drive_login(sess))

    deadline = asyncio.get_running_loop().time() + 8.0
    while asyncio.get_running_loop().time() < deadline:
        if sess.url or sess.phase in {"succeeded", "failed", "cancelled"}:
            break
        await asyncio.sleep(0.15)

    return get_login_status(kind)


async def _drive_login(sess: LoginSession) -> None:
    proc = sess._proc
    if proc is None or proc.stdout is None:
        sess.phase = "failed"
        sess.detail = "no_process"
        return
    buf = ""
    try:
        while True:
            line_b = await proc.stdout.readline()
            if not line_b:
                break
            line = line_b.decode("utf-8", errors="replace")
            buf += line
            if not sess.url:
                found = _extract_url(buf)
                if found:
                    sess.url = found
                    sess.phase = "waiting_browser"
                    sess.detail = "waiting_browser"
            if sess.phase == "waiting_browser":
                p = probe_local_cli(sess.kind)
                if p.get("authenticated") and p.get("code") in {"ready", "fake"}:
                    sess.phase = "succeeded"
                    sess.detail = "authenticated"
                    break
        code = await proc.wait()
        sess.exit_code = code
        if sess.phase == "cancelled":
            return
        p = probe_local_cli(sess.kind)
        if p.get("authenticated") and p.get("code") in {"ready", "fake"}:
            sess.phase = "succeeded"
            sess.detail = "authenticated"
        elif code == 0 and sess.phase != "failed":
            if p.get("authenticated"):
                sess.phase = "succeeded"
                sess.detail = "authenticated"
            else:
                sess.phase = "succeeded" if sess.url else "failed"
                sess.detail = (
                    "login_process_exited" if sess.url else "login_failed"
                )
        elif sess.phase not in {"succeeded"}:
            sess.phase = "failed"
            sess.detail = (buf[-500:] or f"exit_{code}").strip()
    except asyncio.CancelledError:
        sess.phase = "cancelled"
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("login drive failed for %s", sess.kind)
        sess.phase = "failed"
        sess.detail = str(exc)
    finally:
        sess._proc = None

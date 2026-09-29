"""Vendor session ids for external CLIs (Cursor, Codex, Claude Code).

One id per TerminalWisely thread and runtime, stored on the SessionLog so
``create_run_resuming`` carries it. Resume is confirmed only when the CLI
does not reject the id and (for Cursor and Codex) returns that same id.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.runtime.local_cli import LocalCliKind
from app.session.log import SurfaceOp

EXTERNAL_SESSIONS_EVENT = "external_session"


def build_runtime_argv(
    kind: LocalCliKind,
    *,
    prefix: list[str],
    prompt: str,
    workspace: Path,
    mcp_config: Path,
    resume_id: str | None = None,
) -> list[str]:
    """Headless argv. ``resume_id`` selects the vendor's resume form.

    Codex never gets ``--ephemeral``: those sessions cannot be resumed, and
    ``exec resume`` of an ephemeral id silently starts a new thread.
    """
    resume = (resume_id or "").strip() or None
    if kind == "cursor":
        argv = [
            *prefix,
            "-p",
            "--output-format",
            "stream-json",
            "--workspace",
            str(workspace),
            "--approve-mcps",
            "--trust",
            "-f",
        ]
        if resume:
            argv.append(f"--resume={resume}")
        argv.append(prompt)
        return argv
    if kind == "claude":
        # --verbose is required when -p + stream-json.
        # bypassPermissions only unblocks calling TW MCP; CommandBroker still
        # gates remote mutations.
        argv = [
            *prefix,
            "-p",
            "--output-format",
            "stream-json",
            "--verbose",
            "--include-partial-messages",
            "--permission-mode",
            "bypassPermissions",
            "--mcp-config",
            str(mcp_config),
            "--strict-mcp-config",
        ]
        if resume:
            argv.extend(["--resume", resume])
        argv.append(prompt)
        return argv
    argv = [
        *prefix,
        "exec",
        "--json",
        "--cd",
        str(workspace),
        "--skip-git-repo-check",
        "--approve-for-me",
        "--disable",
        "computer_use",
    ]
    if resume:
        # Parent `exec` options, then the resume subcommand and the thread id.
        argv.extend(["resume", resume])
    argv.append(prompt)
    return argv


def stored_vendor_session_id(run: Any, kind: str) -> str | None:
    """Latest vendor session id for this runtime on the run's SessionLog."""
    found: str | None = None
    log = getattr(run, "session_log", None)
    events = getattr(log, "events", None) or []
    for ev in events:
        if getattr(ev, "type", None) != EXTERNAL_SESSIONS_EVENT:
            continue
        data = getattr(ev, "data", None) or {}
        if str(data.get("runtime") or "") != kind:
            continue
        sid = str(data.get("session_id") or "").strip()
        if sid:
            found = sid
    if found:
        return found
    bucket = (getattr(run, "metadata", None) or {}).get("external_sessions")
    if isinstance(bucket, dict):
        sid = str(bucket.get(kind) or "").strip()
        return sid or None
    return None


def remember_vendor_session(run: Any, kind: str, session_id: str) -> None:
    """Record the vendor id after this turn's surface is complete.

    Call this *after* the assistant reply is on the SessionLog so
    ``vendor_session_is_stale`` can detect later turns from other runtimes.
    """
    sid = (session_id or "").strip()
    if not sid:
        return
    meta = getattr(run, "metadata", None)
    if isinstance(meta, dict):
        bucket = meta.get("external_sessions")
        if not isinstance(bucket, dict):
            bucket = {}
            meta["external_sessions"] = bucket
        bucket[kind] = sid
    log = getattr(run, "session_log", None)
    if log is not None and hasattr(log, "append"):
        log.append(
            EXTERNAL_SESSIONS_EVENT,
            {"runtime": kind, "session_id": sid},
            surface_op=SurfaceOp.none(),
        )
    flush = getattr(run, "_flush_session_log", None)
    if callable(flush):
        flush()


_SURFACE_AFTER_BIND = frozenset(
    {
        "user/message",
        "assistant/message",
        "tool/result",
    }
)


def vendor_session_is_stale(run: Any, kind: str) -> bool:
    """True when SessionLog advanced after this runtime's last bound session.

    Same-agent follow-ups leave no surface after the bind event. Switching to
    another model/agent (or injecting mid-run user context) appends surface
    nodes afterward — the vendor thread no longer matches TW evidence, so
    resume must be skipped and the continuity pack used instead.
    """
    log = getattr(run, "session_log", None)
    events = getattr(log, "events", None) or []
    last_seq: int | None = None
    for ev in events:
        if getattr(ev, "type", None) != EXTERNAL_SESSIONS_EVENT:
            continue
        data = getattr(ev, "data", None) or {}
        if str(data.get("runtime") or "") != kind:
            continue
        if str(data.get("session_id") or "").strip():
            last_seq = int(getattr(ev, "seq", 0))
    if last_seq is None:
        return False
    for ev in events:
        if int(getattr(ev, "seq", -1)) <= last_seq:
            continue
        if getattr(ev, "type", None) in _SURFACE_AFTER_BIND:
            return True
    return False


_REJECT_SNIPPETS = (
    "session not found",
    "no conversation found",
    "conversation not found",
    "no such session",
    "thread not found",
    "could not find session",
    "could not find a conversation",
    "unable to resume",
    "failed to resume",
    "resume failed",
    "no previous session",
)


def text_rejects_resume(text: str) -> bool:
    """True when CLI error text says the vendor session cannot be continued."""
    low = (text or "").lower()
    if any(snippet in low for snippet in _REJECT_SNIPPETS):
        return True
    if "ephemeral" in low and any(
        word in low for word in ("session", "resume", "thread", "cannot", "can't")
    ):
        return True
    return False


def resume_attempt_accepted(
    kind: str,
    requested_id: str,
    observed_ids: list[str],
    *,
    reject_text: str = "",
) -> bool:
    """Exit code 0 is not acceptance.

    Cursor and Codex must echo the requested id. Claude Code may rotate
    ``session_id`` on the result event; any id is kept when the CLI did not
    reject the resume.
    """
    if text_rejects_resume(reject_text):
        return False
    if not observed_ids:
        return False
    if kind == "claude":
        return True
    requested = (requested_id or "").strip()
    return all(obs.strip() == requested for obs in observed_ids if obs.strip())

"""In-memory session / run state + hash-chained SQLite audit."""

from __future__ import annotations

import asyncio
import hashlib
import json
import sqlite3
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from app import paths
from app.models.agent import PullEvent
from app.models.approval import ActionApproval, PrivilegeLease, TargetSessionIdentity
from app.session.log import SessionLog
from app.session.store import (
    clone_log,
    list_run_ids_for_session,
    load_session_log,
    save_session_log,
)


class RunStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    WAITING_TOOL = "waiting_tool"
    WAITING_USER = "waiting_user"
    WAITING_APPROVAL = "waiting_approval"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class PendingToolWait:
    call_id: str
    tool_name: str
    future: asyncio.Future[dict[str, Any]]
    risk: str = "R0"
    command: str = ""


@dataclass
class PendingUserWait:
    request_id: str
    future: asyncio.Future[dict[str, Any]]


@dataclass
class PendingApprovalWait:
    approval_id: str
    call_id: str
    command: str
    risk: str
    future: asyncio.Future[dict[str, Any]]
    lease: PrivilegeLease | None = None
    approval: ActionApproval | None = None


@dataclass
class AgentRun:
    session_id: str
    run_id: str
    status: RunStatus = RunStatus.RUNNING
    session_log: SessionLog = field(default_factory=SessionLog)
    events: list[PullEvent] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    error: str | None = None
    pending_tool: PendingToolWait | None = None
    pending_user: PendingUserWait | None = None
    pending_approval: PendingApprovalWait | None = None
    tool_calls_used: int = 0
    task: asyncio.Task[None] | None = None
    cancel_requested: bool = False
    security_mode: str = "safe"
    interaction_mode: str = "agent"
    identity: TargetSessionIdentity | None = None
    verify_nudged: bool = False
    last_mutation_risk: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    persist_session: bool = False
    _event_waiters: list[asyncio.Event] = field(default_factory=list, repr=False)

    @property
    def messages(self) -> list[dict[str, Any]]:
        """OpenAI-shaped projection of the session surface (copy)."""
        return self.session_log.derive_messages()

    @messages.setter
    def messages(self, value: list[dict[str, Any]]) -> None:
        self.session_log.replace_surface_messages(list(value))
        self._flush_session_log()

    def append_message(self, msg: dict[str, Any]) -> None:
        """Append one OpenAI-shaped message onto the session surface."""
        role = msg.get("role")
        if role == "system":
            self.session_log.append_system(str(msg.get("content") or ""))
        elif role == "user":
            content = msg.get("content")
            if isinstance(content, list):
                self.session_log.append_user(content)
            else:
                self.session_log.append_user(str(content or ""))
        elif role == "assistant":
            tcs = msg.get("tool_calls")
            self.session_log.append_assistant(
                msg.get("content") if msg.get("content") is not None else None,
                list(tcs) if tcs else None,
            )
        elif role == "tool":
            self.session_log.append_tool_result(
                str(msg.get("tool_call_id") or ""),
                str(msg.get("content") or ""),
            )
        else:
            return
        self._flush_session_log()

    def insert_system_message(self, content: str) -> None:
        self.session_log.insert_system_at_front(content)
        self._flush_session_log()

    def _flush_session_log(self) -> None:
        if not self.persist_session:
            return
        try:
            # Full rewrite is fine for Phase P0 (runs are bounded).
            save_session_log(self.session_id, self.run_id, self.session_log)
        except OSError:
            pass

    def append_event(self, type_: str, payload: dict[str, Any] | None = None) -> PullEvent:
        ev = PullEvent(type=type_, payload=payload or {}, seq=len(self.events))
        self.events.append(ev)
        self.updated_at = time.time()
        for waiter in list(self._event_waiters):
            waiter.set()
        return ev

    def pull_since(self, cursor: int) -> list[PullEvent]:
        if cursor < 0:
            cursor = 0
        return list(self.events[cursor:])

    async def wait_for_new_events(self, cursor: int, *, timeout: float = 0.5) -> bool:
        """Return True if new events appeared (or status likely changed)."""
        if len(self.events) > cursor:
            return True
        waiter = asyncio.Event()
        self._event_waiters.append(waiter)
        try:
            await asyncio.wait_for(waiter.wait(), timeout=timeout)
            return True
        except TimeoutError:
            return len(self.events) > cursor
        finally:
            try:
                self._event_waiters.remove(waiter)
            except ValueError:
                pass


class SessionStore:
    """Process-local store for pull protocol sessions."""

    def __init__(self, *, enable_audit: bool = True) -> None:
        self._runs: dict[str, AgentRun] = {}
        self._session_latest: dict[str, str] = {}
        self._lock = asyncio.Lock()
        self._audit = AuditLog() if enable_audit else None

    def get_run(self, run_id: str) -> AgentRun | None:
        return self._runs.get(run_id)

    def get_session_run(self, session_id: str) -> AgentRun | None:
        rid = self._session_latest.get(session_id)
        if not rid:
            return None
        return self._runs.get(rid)

    def create_run(
        self,
        session_id: str,
        run_id: str | None = None,
        *,
        security_mode: str | None = None,
        interaction_mode: str | None = None,
        identity: TargetSessionIdentity | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AgentRun:
        # Cancel any prior active run on the same session (single active AI owner).
        prev = self.get_session_run(session_id)
        if prev and prev.status in (
            RunStatus.RUNNING,
            RunStatus.WAITING_TOOL,
            RunStatus.WAITING_USER,
            RunStatus.WAITING_APPROVAL,
        ):
            prev.cancel_requested = True
            if prev.task and not prev.task.done():
                prev.task.cancel()
            prev.status = RunStatus.CANCELLED
            prev.append_event("cancelled", {"reason": "superseded_by_new_run"})

        from app.harness.interaction_mode import normalize_interaction_mode

        rid = run_id or str(uuid.uuid4())
        run = AgentRun(
            session_id=session_id,
            run_id=rid,
            security_mode=security_mode or paths.security_mode(),
            interaction_mode=normalize_interaction_mode(interaction_mode),
            identity=identity
            or TargetSessionIdentity(session_id=session_id),
            metadata=metadata or {},
            persist_session=True,
        )
        self._runs[rid] = run
        self._session_latest[session_id] = rid
        if self._audit:
            self._audit.write(
                "run_created",
                {
                    "session_id": session_id,
                    "run_id": rid,
                    "security_mode": run.security_mode,
                    "interaction_mode": run.interaction_mode,
                },
            )
        return run

    def hydrate_run_from_disk(
        self,
        session_id: str,
        run_id: str,
        *,
        security_mode: str | None = None,
        interaction_mode: str | None = None,
        identity: TargetSessionIdentity | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AgentRun | None:
        """Load a completed/interrupted run's SessionLog back into memory."""
        existing = self._runs.get(run_id)
        if existing is not None:
            return existing
        log = load_session_log(session_id, run_id)
        if log is None:
            return None
        from app.harness.interaction_mode import normalize_interaction_mode

        run = AgentRun(
            session_id=session_id,
            run_id=run_id,
            status=RunStatus.IDLE,
            session_log=log,
            security_mode=security_mode or paths.security_mode(),
            interaction_mode=normalize_interaction_mode(interaction_mode),
            identity=identity or TargetSessionIdentity(session_id=session_id),
            metadata={**(metadata or {}), "hydrated_from_disk": True},
            persist_session=True,
        )
        self._runs[run_id] = run
        self._session_latest[session_id] = run_id
        self.audit(
            "run_hydrated",
            {"session_id": session_id, "run_id": run_id, "events": len(log.events)},
        )
        return run

    def create_run_resuming(
        self,
        session_id: str,
        resume_run_id: str,
        *,
        security_mode: str | None = None,
        interaction_mode: str | None = None,
        identity: TargetSessionIdentity | None = None,
        metadata: dict[str, Any] | None = None,
        new_run_id: str | None = None,
    ) -> AgentRun | None:
        """Start a new run seeded from a prior run's SessionLog (memory or disk)."""
        source_log: SessionLog | None = None
        prior = self._runs.get(resume_run_id)
        if prior is not None and prior.session_id == session_id:
            source_log = prior.session_log
        else:
            source_log = load_session_log(session_id, resume_run_id)
        if source_log is None:
            return None

        # Cancel any active run on this session.
        prev = self.get_session_run(session_id)
        if prev and prev.status in (
            RunStatus.RUNNING,
            RunStatus.WAITING_TOOL,
            RunStatus.WAITING_USER,
            RunStatus.WAITING_APPROVAL,
        ):
            prev.cancel_requested = True
            if prev.task and not prev.task.done():
                prev.task.cancel()
            prev.status = RunStatus.CANCELLED
            prev.append_event("cancelled", {"reason": "superseded_by_resume"})

        from app.harness.interaction_mode import normalize_interaction_mode

        rid = new_run_id or str(uuid.uuid4())
        meta = {
            **(metadata or {}),
            "resumed_from": resume_run_id,
        }
        run = AgentRun(
            session_id=session_id,
            run_id=rid,
            session_log=clone_log(source_log),
            security_mode=security_mode or paths.security_mode(),
            interaction_mode=normalize_interaction_mode(
                interaction_mode
                or (prior.interaction_mode if prior and prior.session_id == session_id else None)
            ),
            identity=identity or TargetSessionIdentity(session_id=session_id),
            metadata=meta,
            persist_session=True,
        )
        run._flush_session_log()
        self._runs[rid] = run
        self._session_latest[session_id] = rid
        self.audit(
            "run_resumed",
            {
                "session_id": session_id,
                "run_id": rid,
                "resume_run_id": resume_run_id,
                "surface_messages": len(run.messages),
                "interaction_mode": run.interaction_mode,
            },
        )
        return run

    def list_persisted_runs(self, session_id: str) -> list[dict[str, Any]]:
        return list_run_ids_for_session(session_id)

    def cancel_run(self, run_id: str) -> AgentRun | None:
        run = self._runs.get(run_id)
        if not run:
            return None
        run.cancel_requested = True
        if run.task and not run.task.done():
            run.task.cancel()
        # Unblock any waiters so the loop can exit.
        for pending in (run.pending_tool, run.pending_user, run.pending_approval):
            if pending and not pending.future.done():
                pending.future.set_result({"ok": False, "cancelled": True, "error": "cancelled"})
        run.pending_tool = None
        run.pending_user = None
        run.pending_approval = None
        if run.status not in (RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED):
            run.status = RunStatus.CANCELLED
            run.append_event("cancelled", {"reason": "user_stop"})
        self.audit("run_cancelled", {"session_id": run.session_id, "run_id": run_id})
        return run

    def audit(self, event: str, payload: dict[str, Any]) -> None:
        if self._audit:
            self._audit.write(event, payload)

    def verify_audit_chain(self) -> dict[str, Any]:
        if not self._audit:
            return {"ok": True, "entries": 0}
        return self._audit.verify_chain()


class AuditLog:
    """Hash-chained SQLite audit under TW_AI_DATA_DIR."""

    def __init__(self) -> None:
        self.path = paths.sqlite_path()
        self._ensure()

    def _ensure(self) -> None:
        conn = sqlite3.connect(self.path)
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS audit (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts REAL NOT NULL,
                    event TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    prev_hash TEXT NOT NULL,
                    entry_hash TEXT NOT NULL
                )
                """
            )
            # Migrate older schema without hash columns.
            cols = {r[1] for r in conn.execute("PRAGMA table_info(audit)").fetchall()}
            if "prev_hash" not in cols:
                conn.execute("ALTER TABLE audit ADD COLUMN prev_hash TEXT NOT NULL DEFAULT ''")
            if "entry_hash" not in cols:
                conn.execute("ALTER TABLE audit ADD COLUMN entry_hash TEXT NOT NULL DEFAULT ''")
            conn.commit()
        finally:
            conn.close()

    def _last_hash(self, conn: sqlite3.Connection) -> str:
        row = conn.execute(
            "SELECT entry_hash FROM audit ORDER BY id DESC LIMIT 1"
        ).fetchone()
        return str(row[0]) if row and row[0] else "genesis"

    def write(self, event: str, payload: dict[str, Any]) -> str:
        conn = sqlite3.connect(self.path)
        try:
            prev = self._last_hash(conn)
            ts = time.time()
            body = json.dumps(payload, ensure_ascii=False, sort_keys=True)
            material = f"{prev}|{ts}|{event}|{body}"
            entry_hash = hashlib.sha256(material.encode("utf-8")).hexdigest()
            conn.execute(
                "INSERT INTO audit (ts, event, payload, prev_hash, entry_hash) VALUES (?, ?, ?, ?, ?)",
                (ts, event, body, prev, entry_hash),
            )
            conn.commit()
            return entry_hash
        finally:
            conn.close()

    def verify_chain(self) -> dict[str, Any]:
        conn = sqlite3.connect(self.path)
        try:
            rows = conn.execute(
                "SELECT id, ts, event, payload, prev_hash, entry_hash FROM audit ORDER BY id ASC"
            ).fetchall()
        finally:
            conn.close()
        expected_prev = "genesis"
        for row in rows:
            _id, ts, event, payload, prev_hash, entry_hash = row
            if prev_hash != expected_prev and entry_hash:
                # Allow legacy empty-hash rows.
                if prev_hash or entry_hash:
                    return {
                        "ok": False,
                        "broken_at": _id,
                        "expected_prev": expected_prev,
                        "got_prev": prev_hash,
                    }
            if entry_hash:
                material = f"{prev_hash}|{ts}|{event}|{payload}"
                calc = hashlib.sha256(material.encode("utf-8")).hexdigest()
                if calc != entry_hash:
                    return {"ok": False, "broken_at": _id, "reason": "hash_mismatch"}
                expected_prev = entry_hash
        return {"ok": True, "entries": len(rows)}


# Global store used by FastAPI app.
STORE = SessionStore()

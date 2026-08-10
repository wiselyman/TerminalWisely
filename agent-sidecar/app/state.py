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
    messages: list[dict[str, Any]] = field(default_factory=list)
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
    identity: TargetSessionIdentity | None = None
    verify_nudged: bool = False
    last_mutation_risk: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    _event_waiters: list[asyncio.Event] = field(default_factory=list, repr=False)

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

        rid = run_id or str(uuid.uuid4())
        run = AgentRun(
            session_id=session_id,
            run_id=rid,
            security_mode=security_mode or paths.security_mode(),
            identity=identity
            or TargetSessionIdentity(session_id=session_id),
            metadata=metadata or {},
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
                },
            )
        return run

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

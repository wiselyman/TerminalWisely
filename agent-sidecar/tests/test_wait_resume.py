"""Durable wait snapshot: survive memory wipe, hydrate, deliver, continue."""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.agent.graph import (
    ensure_hydrated_wait_armed,
    record_wait_snapshot,
    rearm_wait_from_disk,
)
from app.agent.loop import AgentLoop, deliver_approval_decision, deliver_tool_result
from app.agent.wait_snapshot import load_wait_snapshot, save_wait_snapshot
from app.models.approval import (
    ActionApproval,
    PrivilegeLease,
    TargetSessionIdentity,
)
from app.models.terminal import RiskLevel
from app.session.log import SessionLog
from app.session.store import save_session_log
from app.state import STORE, AgentRun, RunStatus


@pytest.fixture(autouse=True)
def _iso(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    STORE._runs.clear()
    STORE._session_latest.clear()


def _make_run(session_id: str = "sess1", run_id: str = "run1") -> AgentRun:
    log = SessionLog()
    log.append("user_message", {"content": "hi"})
    save_session_log(session_id, run_id, log)
    run = AgentRun(
        session_id=session_id,
        run_id=run_id,
        status=RunStatus.RUNNING,
        session_log=log,
        persist_session=True,
        identity=TargetSessionIdentity(session_id=session_id),
    )
    STORE._runs[run_id] = run
    STORE._session_latest[session_id] = run_id
    return run


@pytest.mark.asyncio
async def test_tool_wait_rearm_after_memory_wipe() -> None:
    run = _make_run()
    snap = {
        "kind": "tool",
        "call_id": "call_abc",
        "tool_name": "terminal_exec",
        "command": "uname -a",
        "risk": "R0",
        "record_tool_message": True,
    }
    record_wait_snapshot(run, snap)
    assert load_wait_snapshot(run.session_id, run.run_id) is not None

    # Simulate sidecar restart: drop in-memory run, keep disk.
    STORE._runs.clear()
    STORE._session_latest.clear()

    hydrated = STORE.hydrate_run_from_disk(run.session_id, run.run_id)
    assert hydrated is not None
    assert ensure_hydrated_wait_armed(hydrated) is True
    assert hydrated.status == RunStatus.WAITING_TOOL
    assert hydrated.pending_tool is not None
    assert hydrated.pending_tool.call_id == "call_abc"

    ok = deliver_tool_result(
        hydrated,
        "call_abc",
        {"ok": True, "stdout": "Linux", "stderr": "", "exit_code": 0, "_untrusted": True},
    )
    assert ok is True
    # Watcher resumes loop; with no model it may fail — just ensure future resolved.
    await asyncio.sleep(0.05)
    assert hydrated.pending_tool is None or hydrated.pending_tool.future.done()


@pytest.mark.asyncio
async def test_approval_finish_from_snapshot() -> None:
    run = _make_run(run_id="run_appr")
    identity = TargetSessionIdentity(session_id=run.session_id)
    lease = PrivilegeLease(
        lease_id="lease_1",
        session_id=run.session_id,
        command="systemctl restart nginx",
        identity=identity,
        risk=RiskLevel.R2,
        expires_at_epoch_s=9_999_999_999,
        max_executions=1,
    )
    approval = ActionApproval(
        approval_id="appr_1",
        lease_id=lease.lease_id,
        call_id="call_mut",
        session_id=run.session_id,
        run_id=run.run_id,
        command="systemctl restart nginx",
        risk=RiskLevel.R2,
        reason="restart",
        identity=identity,
    )
    snap: dict[str, Any] = {
        "kind": "approval",
        "approval_id": "appr_1",
        "call_id": "call_mut",
        "command": "systemctl restart nginx",
        "exec_command": "systemctl restart nginx",
        "risk": "R2",
        "dual": False,
        "lease": lease.model_dump(mode="json"),
        "approval": approval.model_dump(mode="json"),
        "rollback_plan": None,
        "identity": identity.model_dump(mode="json"),
        "resume": "terminal_exec",
        "timeout_seconds": 30,
        "intent": "restart nginx",
        "reason": "restart",
    }
    save_wait_snapshot(run.session_id, run.run_id, snap)
    run.metadata["wait_snapshot"] = snap
    run.status = RunStatus.WAITING_APPROVAL

    loop = AgentLoop(run)
    out = await loop.finish_approval_wait({"approved": True}, snap)
    assert out is not None
    lease_out, cmd, _ = out
    assert cmd == "systemctl restart nginx"
    assert lease_out.lease_id == "lease_1"
    assert run.status == RunStatus.RUNNING
    assert load_wait_snapshot(run.session_id, run.run_id) is None


@pytest.mark.asyncio
async def test_rearm_approval_then_deliver() -> None:
    run = _make_run(run_id="run_appr2")
    identity = TargetSessionIdentity(session_id=run.session_id)
    lease = PrivilegeLease(
        lease_id="lease_2",
        session_id=run.session_id,
        command="touch /tmp/x",
        identity=identity,
        risk=RiskLevel.R1,
        expires_at_epoch_s=9_999_999_999,
        max_executions=1,
    )
    approval = ActionApproval(
        approval_id="appr_2",
        lease_id=lease.lease_id,
        call_id="call_2",
        session_id=run.session_id,
        run_id=run.run_id,
        command="touch /tmp/x",
        risk=RiskLevel.R1,
        reason="create file",
        identity=identity,
    )
    snap = {
        "kind": "approval",
        "approval_id": "appr_2",
        "call_id": "call_2",
        "command": "touch /tmp/x",
        "exec_command": "touch /tmp/x",
        "risk": "R1",
        "dual": False,
        "lease": lease.model_dump(mode="json"),
        "approval": approval.model_dump(mode="json"),
        "rollback_plan": None,
        "identity": identity.model_dump(mode="json"),
        "resume": "terminal_exec",
        "timeout_seconds": 30,
        "intent": "touch",
        "reason": "create file",
    }
    record_wait_snapshot(run, snap)
    STORE._runs.clear()
    STORE._session_latest.clear()

    hydrated = STORE.hydrate_run_from_disk(run.session_id, run.run_id)
    assert hydrated is not None
    assert rearm_wait_from_disk(hydrated) is True
    assert hydrated.status == RunStatus.WAITING_APPROVAL
    assert deliver_approval_decision(
        hydrated,
        "appr_2",
        {"approved": False},
    )
    assert hydrated.pending_approval is not None
    assert hydrated.pending_approval.future.done()

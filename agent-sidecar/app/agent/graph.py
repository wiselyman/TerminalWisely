"""LangGraph macro lifecycle + durable host-wait resume.

In-process waits still use AgentLoop futures (low latency). Wait snapshots are
persisted so sidecar restart can re-arm pending tool/user/approval and continue
via resume_after_* without losing SessionLog context.

True mid-node langgraph.interrupt() would re-execute the whole agent_loop node
from the top (LangGraph semantics) and is deferred until AgentLoop is a
stepwise state machine.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, TypedDict

from app.agent.loop import AgentLoop
from app.agent.wait_snapshot import (
    clear_wait_snapshot,
    load_wait_snapshot,
    save_wait_snapshot,
)
from app.models.approval import (
    ActionApproval,
    PrivilegeLease,
)
from app.state import (
    AgentRun,
    PendingApprovalWait,
    PendingToolWait,
    PendingUserWait,
    RunStatus,
)

logger = logging.getLogger(__name__)


class GraphState(TypedDict, total=False):
    session_id: str
    run_id: str
    user_message: str | list[dict[str, Any]]
    status: str


_GRAPH = None
_CHECKPOINTER = None
_wait_watchers: dict[str, asyncio.Task[None]] = {}


def _langgraph_checkpointer() -> Any:
    """Lazy import so wait-snapshot helpers work even if langgraph is not installed yet."""
    global _CHECKPOINTER
    if _CHECKPOINTER is None:
        from langgraph.checkpoint.memory import MemorySaver

        _CHECKPOINTER = MemorySaver()
    return _CHECKPOINTER


async def _run_loop_node(state: GraphState) -> GraphState:
    """Macro node: drive AgentLoop until pause or done. Waits stay inside AgentLoop."""
    from app.state import STORE

    run = STORE.get_run(state["run_id"])
    if run is None:
        return {"status": "failed"}
    loop = AgentLoop(run)
    await loop.run_until_pause_or_done(state.get("user_message"))
    # Persist interrupt surface for operators / restart.
    if run.status in (
        RunStatus.WAITING_TOOL,
        RunStatus.WAITING_USER,
        RunStatus.WAITING_APPROVAL,
    ):
        snap = run.metadata.get("wait_snapshot")
        if isinstance(snap, dict):
            save_wait_snapshot(run.session_id, run.run_id, snap)
            run.append_event("graph_interrupt", {"status": run.status.value, "wait": snap})
    return {"status": run.status.value}


def build_agent_graph() -> Any:
    from langgraph.graph import END, START, StateGraph

    g: StateGraph = StateGraph(GraphState)
    g.add_node("agent_loop", _run_loop_node)
    g.add_edge(START, "agent_loop")
    g.add_edge("agent_loop", END)
    return g.compile(checkpointer=_langgraph_checkpointer())


def get_agent_graph() -> Any:
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = build_agent_graph()
    return _GRAPH


async def start_run_via_graph(
    run: AgentRun, user_message: str | list[dict[str, Any]]
) -> None:
    """Entry used by FastAPI — LangGraph wraps AgentLoop with MemorySaver thread_id=run_id."""
    graph = get_agent_graph()
    await graph.ainvoke(
        {
            "session_id": run.session_id,
            "run_id": run.run_id,
            "user_message": user_message,
            "status": RunStatus.RUNNING.value,
        },
        config={"configurable": {"thread_id": run.run_id}},
    )


def record_wait_snapshot(run: AgentRun, snapshot: dict[str, Any]) -> None:
    run.metadata["wait_snapshot"] = snapshot
    try:
        save_wait_snapshot(run.session_id, run.run_id, snapshot)
    except OSError:
        logger.warning("failed to persist wait snapshot", exc_info=True)


def clear_run_wait(run: AgentRun) -> None:
    run.metadata.pop("wait_snapshot", None)
    clear_wait_snapshot(run.session_id, run.run_id)


def rearm_wait_from_disk(run: AgentRun) -> bool:
    """After hydrate: restore pending_* futures from durable snapshot. Returns True if armed."""
    snap = load_wait_snapshot(run.session_id, run.run_id)
    if not snap:
        snap = run.metadata.get("wait_snapshot")
    if not isinstance(snap, dict):
        return False
    kind = str(snap.get("kind") or "")
    loop = asyncio.get_running_loop()
    if kind == "tool":
        call_id = str(snap.get("call_id") or "")
        if not call_id:
            return False
        fut: asyncio.Future[dict[str, Any]] = loop.create_future()
        run.pending_tool = PendingToolWait(
            call_id=call_id,
            tool_name=str(snap.get("tool_name") or "terminal_exec"),
            future=fut,
            risk=str(snap.get("risk") or "R0"),
            command=str(snap.get("command") or ""),
        )
        run.status = RunStatus.WAITING_TOOL
        run.metadata["wait_snapshot"] = snap
        return True
    if kind == "user":
        request_id = str(snap.get("request_id") or "")
        call_id = str(snap.get("call_id") or "")
        if not request_id:
            return False
        fut_u: asyncio.Future[dict[str, Any]] = loop.create_future()
        run.pending_user = PendingUserWait(request_id=request_id, future=fut_u)
        run.status = RunStatus.WAITING_USER
        run.metadata["wait_snapshot"] = snap
        run.metadata["wait_ask_call_id"] = call_id
        return True
    if kind == "approval":
        approval_id = str(snap.get("approval_id") or "")
        if not approval_id:
            return False
        fut_a: asyncio.Future[dict[str, Any]] = loop.create_future()
        lease_raw = snap.get("lease") or {}
        approval_raw = snap.get("approval") or {}
        lease = None
        approval = None
        try:
            if lease_raw:
                lease = PrivilegeLease.model_validate(lease_raw)
            if approval_raw:
                approval = ActionApproval.model_validate(approval_raw)
        except Exception:  # noqa: BLE001
            logger.warning("wait snapshot lease/approval parse failed", exc_info=True)
        run.pending_approval = PendingApprovalWait(
            approval_id=approval_id,
            call_id=str(snap.get("call_id") or ""),
            command=str(snap.get("command") or ""),
            risk=str(snap.get("risk") or "R2"),
            future=fut_a,
            lease=lease,
            approval=approval,
        )
        run.status = RunStatus.WAITING_APPROVAL
        run.metadata["wait_snapshot"] = snap
        return True
    return False


def arm_wait_watcher(run: AgentRun) -> None:
    """Background: await re-armed future then continue AgentLoop (post-restart)."""
    rid = run.run_id
    prev = _wait_watchers.get(rid)
    if prev and not prev.done():
        return

    async def _watch() -> None:
        try:
            await _watch_wait_and_resume(run)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("wait watcher failed run_id=%s", rid)
        finally:
            _wait_watchers.pop(rid, None)

    _wait_watchers[rid] = asyncio.create_task(_watch())


async def _watch_wait_and_resume(run: AgentRun) -> None:
    from app.state import STORE

    live = STORE.get_run(run.run_id) or run
    snap = live.metadata.get("wait_snapshot") or load_wait_snapshot(live.session_id, live.run_id) or {}
    kind = str(snap.get("kind") or "")
    loop = AgentLoop(live)

    if kind == "tool" and live.pending_tool is not None:
        payload = await live.pending_tool.future
        clear_run_wait(live)
        live.pending_tool = None
        if payload.get("cancelled"):
            live.status = RunStatus.CANCELLED
            loop._emit_conclusion(RunStatus.CANCELLED, None)
            return
        if snap.get("record_tool_message", True):
            await loop._add_tool_result(str(snap.get("call_id") or ""), payload)
        live.status = RunStatus.RUNNING
        await loop.resume_after_tool()
        return

    if kind == "user" and live.pending_user is not None:
        answer = await live.pending_user.future
        clear_run_wait(live)
        call_id = str(snap.get("call_id") or live.metadata.get("wait_ask_call_id") or "")
        live.pending_user = None
        if answer.get("cancelled"):
            loop._emit_conclusion(RunStatus.CANCELLED, None)
            return
        await loop._add_tool_result(
            call_id,
            {
                "ok": True,
                "ask_user_response": answer,
                "_note": "User clarification (not mutation approval).",
            },
        )
        live.status = RunStatus.RUNNING
        await loop.resume_after_user()
        return

    if kind == "approval" and live.pending_approval is not None:
        decision = await live.pending_approval.future
        await loop.resume_from_approval_wait(decision, snap if isinstance(snap, dict) else {})
        return


def ensure_hydrated_wait_armed(run: AgentRun) -> bool:
    """Call after hydrate_run_from_disk when a wait file exists."""
    if run.pending_tool or run.pending_user or run.pending_approval:
        arm_wait_watcher(run)
        return True
    if rearm_wait_from_disk(run):
        arm_wait_watcher(run)
        # Re-surface interrupt to FE pull stream
        snap = run.metadata.get("wait_snapshot") or {}
        run.append_event(
            "graph_interrupt",
            {"status": run.status.value, "wait": snap, "rearmed": True},
        )
        return True
    return False

"""Detect AgentLoop stall: cold start or mid-run idle (no model progress)."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING

from app.state import RunStatus

if TYPE_CHECKING:
    from app.state import AgentRun

logger = logging.getLogger(__name__)


def _last_progress_at(run: AgentRun) -> float:
    meta = run.metadata
    for key in ("_last_progress_at", "_model_touch_at"):
        raw = meta.get(key)
        if raw is not None:
            try:
                return float(raw)
            except (TypeError, ValueError):
                pass
    return float(run.created_at)


def is_stalled(
    run: AgentRun,
    *,
    now: float,
    stall_seconds: float,
) -> bool:
    """True when a run never progressed into a model sample within the stall window."""
    if run.status != RunStatus.RUNNING:
        return False
    if run.metadata.get("_model_touch_at"):
        return False
    if run.events:
        return False
    return (now - float(run.created_at)) >= float(stall_seconds)


def is_progress_stalled(
    run: AgentRun,
    *,
    now: float,
    stall_seconds: float,
) -> bool:
    """True when RUNNING with no event/stream progress for stall_seconds.

    Waiting on host tool / user / approval must not count as a model stall —
    large downloads can take far longer than the progress window.
    """
    if run.status != RunStatus.RUNNING:
        return False
    # Defense: status sometimes lags; pending waits mean host/user owns the clock.
    if run.pending_tool or run.pending_user or run.pending_approval:
        return False
    return (now - _last_progress_at(run)) >= float(stall_seconds)


def mark_run_progress(run: AgentRun, *, at: float | None = None) -> None:
    """Record that the run made observable progress (event or model chunk)."""
    run.metadata["_last_progress_at"] = float(at if at is not None else time.time())


async def watch_run_for_stall(run: AgentRun) -> None:
    """Background: fail the run if it stays RUNNING with no model progress."""
    from app import paths

    cold = paths.stall_seconds()
    progress = paths.progress_stall_seconds()
    poll = min(5.0, max(1.0, min(cold, progress) / 3.0))
    try:
        while run.status == RunStatus.RUNNING and not run.cancel_requested:
            await asyncio.sleep(poll)
            now = time.time()
            reason: str | None = None
            stall_for = cold
            if is_stalled(run, now=now, stall_seconds=cold):
                reason = f"run stalled: no model progress within {cold:.0f}s"
                stall_for = cold
            elif is_progress_stalled(run, now=now, stall_seconds=progress):
                reason = (
                    f"run stalled: no progress for {progress:.0f}s "
                    "(model hung or silent after tools)"
                )
                stall_for = progress
            if reason is None:
                continue
            run.error = reason
            run.append_event(
                "run_stalled",
                {"stall_seconds": stall_for, "reason": reason},
            )
            run.status = RunStatus.FAILED
            if run.task and not run.task.done():
                run.task.cancel()
            logger.warning(
                "run stalled run_id=%s session_id=%s stall_seconds=%s",
                run.run_id,
                run.session_id,
                stall_for,
            )
            return
    except asyncio.CancelledError:
        return

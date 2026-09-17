"""Detect AgentLoop stall: running with no events and no model HTTP touch."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING

from app.state import RunStatus

if TYPE_CHECKING:
    from app.state import AgentRun

logger = logging.getLogger(__name__)


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


async def watch_run_for_stall(run: AgentRun) -> None:
    """Background: fail the run if it stays RUNNING with no model progress."""
    from app import paths

    n = paths.stall_seconds()
    try:
        while run.status == RunStatus.RUNNING and not run.cancel_requested:
            await asyncio.sleep(min(5.0, max(1.0, n / 3.0)))
            if is_stalled(run, now=time.time(), stall_seconds=n):
                run.error = f"run stalled: no model progress within {n:.0f}s"
                run.append_event("run_stalled", {"stall_seconds": n})
                run.status = RunStatus.FAILED
                if run.task and not run.task.done():
                    run.task.cancel()
                logger.warning(
                    "run stalled run_id=%s session_id=%s stall_seconds=%s",
                    run.run_id,
                    run.session_id,
                    n,
                )
                return
    except asyncio.CancelledError:
        return

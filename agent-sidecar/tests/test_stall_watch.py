from app.agent.stall import is_progress_stalled, is_stalled
from app.state import AgentRun, RunStatus


def test_stalled_when_running_no_events_no_model_touch() -> None:
    run = AgentRun(session_id="s", run_id="r", status=RunStatus.RUNNING)
    run.created_at = 1000.0
    assert is_stalled(run, now=1091.0, stall_seconds=90.0) is True


def test_not_stalled_before_threshold() -> None:
    run = AgentRun(session_id="s", run_id="r", status=RunStatus.RUNNING)
    run.created_at = 1000.0
    assert is_stalled(run, now=1050.0, stall_seconds=90.0) is False


def test_not_stalled_after_model_touch() -> None:
    run = AgentRun(session_id="s", run_id="r", status=RunStatus.RUNNING)
    run.created_at = 1000.0
    run.metadata["_model_touch_at"] = 1001.0
    assert is_stalled(run, now=1200.0, stall_seconds=90.0) is False


def test_not_stalled_when_waiting_tool() -> None:
    run = AgentRun(session_id="s", run_id="r", status=RunStatus.WAITING_TOOL)
    run.created_at = 1000.0
    assert is_stalled(run, now=2000.0, stall_seconds=90.0) is False


def test_not_stalled_after_any_event() -> None:
    run = AgentRun(session_id="s", run_id="r", status=RunStatus.RUNNING)
    run.created_at = 1000.0
    run.append_event("user_message", {"content": "hi"})
    assert is_stalled(run, now=2000.0, stall_seconds=90.0) is False


def test_progress_stalled_after_idle_gap() -> None:
    run = AgentRun(session_id="s", run_id="r", status=RunStatus.RUNNING)
    run.created_at = 1000.0
    run.metadata["_model_touch_at"] = 1001.0
    run.metadata["_last_progress_at"] = 1100.0
    assert is_progress_stalled(run, now=1401.0, stall_seconds=300.0) is True
    assert is_progress_stalled(run, now=1300.0, stall_seconds=300.0) is False


def test_progress_not_stalled_while_waiting_tool() -> None:
    run = AgentRun(session_id="s", run_id="r", status=RunStatus.WAITING_TOOL)
    run.metadata["_last_progress_at"] = 1000.0
    assert is_progress_stalled(run, now=2000.0, stall_seconds=300.0) is False


def test_progress_not_stalled_while_pending_tool_even_if_status_running() -> None:
    """Large downloads: status can lag RUNNING while pending_tool is set."""
    from unittest.mock import MagicMock

    run = AgentRun(session_id="s", run_id="r", status=RunStatus.RUNNING)
    run.metadata["_last_progress_at"] = 1000.0
    run.pending_tool = MagicMock()
    assert is_progress_stalled(run, now=2000.0, stall_seconds=300.0) is False


def test_append_event_updates_last_progress() -> None:
    run = AgentRun(session_id="s", run_id="r", status=RunStatus.RUNNING)
    run.append_event("status", {"phase": "thinking"})
    assert "_last_progress_at" in run.metadata

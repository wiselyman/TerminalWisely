"""Run tracing spans."""

from __future__ import annotations

from app.models.approval import TargetSessionIdentity
from app.observability.trace import RunTracer
from app.state import AgentRun


def test_run_tracer_records_spans() -> None:
    run = AgentRun(
        session_id="s",
        run_id="r",
        identity=TargetSessionIdentity(session_id="s"),
        persist_session=False,
    )
    tracer = RunTracer(run)
    span_id = tracer.start("model", "chat_completions")
    tracer.end(span_id)
    spans = tracer.snapshot()
    assert len(spans) == 1
    assert spans[0]["kind"] == "model"
    assert spans[0]["duration_ms"] is not None
    trace_events = [e for e in run.events if e.type == "trace_span"]
    assert len(trace_events) >= 2

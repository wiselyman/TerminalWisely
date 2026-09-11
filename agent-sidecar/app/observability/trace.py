"""Run-level tracing spans (model / tool / approval latency)."""

from __future__ import annotations

import time
import uuid
from typing import Any

from app.state import AgentRun


class RunTracer:
    def __init__(self, run: AgentRun) -> None:
        self._run = run

    def _spans(self) -> list[dict[str, Any]]:
        raw = self._run.metadata.setdefault("trace_spans", [])
        if not isinstance(raw, list):
            raw = []
            self._run.metadata["trace_spans"] = raw
        return raw

    def start(self, kind: str, name: str, **attrs: Any) -> str:
        span_id = f"span_{uuid.uuid4().hex[:10]}"
        span = {
            "id": span_id,
            "kind": kind,
            "name": name,
            "started_at": time.time(),
            "ended_at": None,
            "duration_ms": None,
            **attrs,
        }
        self._spans().append(span)
        self._run.append_event("trace_span", {"phase": "start", **span})
        return span_id

    def end(self, span_id: str, **attrs: Any) -> None:
        ended = time.time()
        for span in self._spans():
            if span.get("id") != span_id:
                continue
            started = float(span.get("started_at") or ended)
            span["ended_at"] = ended
            span["duration_ms"] = round((ended - started) * 1000, 2)
            span.update(attrs)
            self._run.append_event(
                "trace_span",
                {"phase": "end", **span},
            )
            return

    def snapshot(self) -> list[dict[str, Any]]:
        return [dict(s) for s in self._spans()]

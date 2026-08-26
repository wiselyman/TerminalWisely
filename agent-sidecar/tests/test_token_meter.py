"""Tests for token meter."""

from __future__ import annotations

from app.llm.token_meter import (
    is_context_overflow_error,
    token_budget_reminder,
    token_budget_status,
)


def test_pressure_when_near_budget() -> None:
    msgs = [{"role": "system", "content": "s"}]
    for i in range(30):
        msgs.append({"role": "user", "content": "word " * 300})
        msgs.append({"role": "assistant", "content": "reply " * 300})
    status = token_budget_status(msgs, max_context_tokens=5_000, tools_overhead_tokens=0)
    assert status.pressure or status.exhausted


def test_reminder_once() -> None:
    msgs = [{"role": "user", "content": "x" * 50_000}]
    first = token_budget_reminder(msgs, already_reminded=False, max_context_tokens=3_000)
    assert first is not None
    assert token_budget_reminder(msgs, already_reminded=True, max_context_tokens=3_000) is None


def test_context_overflow_detection() -> None:
    assert is_context_overflow_error(RuntimeError("maximum context length exceeded"))
    assert not is_context_overflow_error(RuntimeError("connection reset"))

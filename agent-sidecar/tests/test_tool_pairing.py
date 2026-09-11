"""Tests for tool-pairing compaction boundaries."""

from __future__ import annotations

from app.session.log import SessionLog
from app.session.tool_pairing import is_balanced_surface_range, select_compactable_range


def _log_with_tool_turn() -> SessionLog:
    log = SessionLog()
    log.append_system("sys")
    log.append_user("run ls")
    log.append_assistant(
        None,
        [{"id": "c1", "type": "function", "function": {"name": "terminal_exec", "arguments": "{}"}}],
    )
    log.append_tool_result("c1", '{"ok": true}')
    log.append_user("thanks")
    log.append_assistant("done")
    return log


def test_balanced_after_complete_tool_turn() -> None:
    log = _log_with_tool_turn()
    assert is_balanced_surface_range(log, 1, 3)


def test_unbalanced_mid_tool_turn() -> None:
    log = SessionLog()
    log.append_system("sys")
    log.append_user("run")
    log.append_assistant(
        None,
        [{"id": "c1", "type": "function", "function": {"name": "x", "arguments": "{}"}}],
    )
    # missing tool result — range including assistant is unbalanced
    assert not is_balanced_surface_range(log, 1, 2)


def test_select_compactable_range_keeps_tail() -> None:
    log = SessionLog()
    log.append_system("sys")
    for i in range(20):
        log.append_user(f"u{i}")
        log.append_assistant(f"a{i}")
    span = select_compactable_range(log, retain_tail=4, min_compact_nodes=4)
    assert span is not None
    start, end = span
    assert start >= 1  # after system
    assert log.surface_len() - end - 1 >= 4

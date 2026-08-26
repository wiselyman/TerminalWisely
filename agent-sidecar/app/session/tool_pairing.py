"""Tool-call pairing boundaries for safe compaction cuts."""

from __future__ import annotations

from app.session.log import SessionLog


def is_balanced_surface_range(log: SessionLog, start: int, end: int) -> bool:
    """True if compacting surface[start..end] leaves no open tool call in range."""
    if start < 0 or end < start:
        return False
    n = log.surface_len()
    if end >= n:
        return False
    pending: set[str] = set()
    for idx in range(start, end + 1):
        ev = log.surface_event_at(idx)
        if ev.type == "assistant/message":
            for tc in ev.data.get("tool_calls") or []:
                if isinstance(tc, dict) and tc.get("id"):
                    pending.add(str(tc["id"]))
        elif ev.type == "tool/result":
            pending.discard(str(ev.data.get("tool_call_id") or ""))
    return len(pending) == 0


def tool_pairing_balanced_after(log: SessionLog, surface_idx: int) -> bool:
    """True if a cut may fall immediately after surface_idx."""
    return is_balanced_surface_range(log, 0, surface_idx)


def select_compactable_range(
    log: SessionLog,
    *,
    retain_tail: int = 8,
    min_compact_nodes: int = 4,
) -> tuple[int, int] | None:
    """Pick surface [start, end] to summarize, keeping last retain_tail nodes."""
    n = log.surface_len()
    if n <= retain_tail + min_compact_nodes:
        return None
    end = n - retain_tail - 1
    if end < 0:
        return None
    # Keep system prompt node at index 0 if present.
    start = 0
    msgs = log.derive_messages()
    if msgs and msgs[0].get("role") == "system":
        start = 1
    if start > end:
        return None
    while end >= start:
        if is_balanced_surface_range(log, start, end):
            if end - start + 1 >= min_compact_nodes:
                return start, end
            return None
        end -= 1
    return None

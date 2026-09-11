"""Tests for CompactionEngine."""

from __future__ import annotations

from typing import Any

from app.session.compaction import CompactionEngine
from app.session.log import SessionLog


class _FakeSummarizer:
    async def chat_completions(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: str | dict[str, Any] | None = "auto",
    ) -> dict[str, Any]:
        return {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "Summary: user asked about nginx; assistant checked status.",
                    }
                }
            ]
        }


def test_compaction_replaces_surface_range() -> None:
    import asyncio

    log = SessionLog()
    log.append_system("sys")
    for i in range(16):
        log.append_user(f"question {i} " + ("x" * 200))
        log.append_assistant(f"answer {i} " + ("y" * 200))

    engine = CompactionEngine(_FakeSummarizer())
    result = asyncio.run(engine.compact_if_needed(log, "overflow", force=True))
    assert result is not None
    msgs = log.derive_messages()
    assert any("compact" in str(m.get("content") or "").lower() or "summary" in str(m.get("content") or "").lower() for m in msgs)
    assert len(msgs) < 34  # was 33 nodes, should shrink


def test_compaction_end_is_durable() -> None:
    import asyncio

    log = SessionLog()
    log.append_system("sys")
    for i in range(16):
        log.append_user(f"question {i} " + ("x" * 200))
        log.append_assistant(f"answer {i} " + ("y" * 200))

    engine = CompactionEngine(_FakeSummarizer())
    result = asyncio.run(engine.compact_if_needed(log, "overflow", force=True))
    assert result is not None
    ends = [e for e in log.events if e.type == "compaction/end"]
    assert ends
    assert ends[-1].data.get("durable") is True


def test_evidence_aware_retain_keeps_more_tail() -> None:
    from app.session.tool_pairing import select_compactable_range

    log = SessionLog()
    log.append_system("sys")
    for i in range(30):
        log.append_user(f"u{i}")
        log.append_assistant(f"a{i}")
    # Recent verify evidence in the default tail window.
    log.append_assistant(
        None,
        [{"id": "c1", "type": "function", "function": {"name": "terminal_exec", "arguments": "{}"}}],
    )
    log.append_tool_result("c1", '{"ok": true, "exit_code": 0, "verify": "service active"}')
    log.append_user("confirm")
    log.append_assistant("verified ok")

    span_default = select_compactable_range(log, retain_tail=4, min_compact_nodes=4)
    assert span_default is not None
    _, end = span_default
    retained = log.surface_len() - end - 1
    assert retained >= 4

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


def test_compaction_skips_when_too_small() -> None:
    import asyncio

    log = SessionLog()
    log.append_system("sys")
    log.append_user("hi")
    log.append_assistant("hello")
    engine = CompactionEngine(_FakeSummarizer())
    assert asyncio.run(engine.compact_if_needed(log, "overflow", force=True)) is None

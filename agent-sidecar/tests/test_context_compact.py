"""Tests for context compaction."""

from __future__ import annotations

from app.llm.context import (
    compact_messages_for_model,
    sanitize_history_item,
    truncate_tool_payload,
)


def test_truncate_tool_payload_shortens_stdout() -> None:
    payload = {"ok": True, "stdout": "x" * 50_000, "exit_code": 0}
    slim = truncate_tool_payload(payload, limit=6_000)
    assert len(str(slim.get("stdout") or "")) < 50_000
    assert slim.get("exit_code") == 0


def test_compact_drops_old_messages() -> None:
    msgs = [{"role": "system", "content": "sys"}]
    for i in range(40):
        msgs.append({"role": "user", "content": f"u{i} " + ("详" * 200)})
        msgs.append({"role": "assistant", "content": f"a{i} " + ("答" * 200)})
    out = compact_messages_for_model(msgs, max_context_tokens=3_000, tools_overhead_tokens=0)
    assert out[0]["role"] == "system"
    assert len(out) < len(msgs)


def test_sanitize_history_drops_cot() -> None:
    assert (
        sanitize_history_item(
            "assistant",
            "The user wants to download Chrome.\n\n1. **Identify the goal**: x",
        )
        is None
    )
    assert sanitize_history_item("user", "安装 chrome") == "安装 chrome"

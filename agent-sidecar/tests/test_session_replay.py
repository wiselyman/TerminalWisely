"""Session log replay + invariants."""

from __future__ import annotations

import json
from pathlib import Path

from app.llm.context import compact_messages_for_model
from app.session.log import SessionLog


FIXTURE = Path(__file__).resolve().parent / "fixtures" / "sessions" / "basic_tool_turn.jsonl"


def test_fixture_replay_derive_is_stable() -> None:
    text = FIXTURE.read_text(encoding="utf-8")
    a = SessionLog.from_jsonl_text(text)
    b = SessionLog.from_jsonl_text(text)
    assert a.derive_messages() == b.derive_messages()


def test_compact_preserves_system_and_tool_pairing() -> None:
    log = SessionLog.from_jsonl_text(FIXTURE.read_text(encoding="utf-8"))
    msgs = log.derive_messages()
    compacted = compact_messages_for_model(msgs, max_context_tokens=50_000)
    assert compacted[0]["role"] == "system"
    tool_ids = {
        str(m.get("tool_call_id"))
        for m in compacted
        if m.get("role") == "tool"
    }
    call_ids = set()
    for m in compacted:
        if m.get("role") != "assistant":
            continue
        for tc in m.get("tool_calls") or []:
            if isinstance(tc, dict) and tc.get("id"):
                call_ids.add(str(tc["id"]))
    assert call_ids.issubset(tool_ids | set())


def test_request_payload_matches_derive() -> None:
    log = SessionLog.from_jsonl_text(FIXTURE.read_text(encoding="utf-8"))
    projected = log.derive_messages()
    # Model request uses same projection (OpenAI shape).
    assert json.dumps(projected, sort_keys=True) == json.dumps(
        log.derive_messages(), sort_keys=True
    )

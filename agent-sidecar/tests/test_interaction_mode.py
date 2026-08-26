"""Tests for InteractionMode tool gates and attachment sanitization."""

from __future__ import annotations

import asyncio

from app.harness.interaction_mode import (
    InteractionModeGate,
    normalize_interaction_mode,
    tool_allowed_in_mode,
    tools_for_interaction_mode,
)
from app.harness.pipeline import ToolExec, ToolPipeline
from app.session.attachments import attachments_to_user_blocks, format_attachment_block
from app.tools.schema import TOOL_SUBMIT_OPS_PLAN, TOOL_TERMINAL_EXEC, TOOL_UPDATE_PLAN


def test_normalize_interaction_mode() -> None:
    assert normalize_interaction_mode(None) == "agent"
    assert normalize_interaction_mode("ASK") == "ask"
    assert normalize_interaction_mode("weird") == "agent"


def test_ask_mode_tool_set() -> None:
    names = {(t.get("function") or {}).get("name") for t in tools_for_interaction_mode("ask")}
    assert TOOL_TERMINAL_EXEC in names
    assert TOOL_SUBMIT_OPS_PLAN not in names
    assert TOOL_UPDATE_PLAN in names


def test_plan_mode_denies_terminal_and_ops() -> None:
    assert not tool_allowed_in_mode(TOOL_TERMINAL_EXEC, "plan")
    assert not tool_allowed_in_mode(TOOL_SUBMIT_OPS_PLAN, "plan")
    assert tool_allowed_in_mode(TOOL_UPDATE_PLAN, "plan")


def test_interaction_mode_gate_denies() -> None:
    async def _run() -> None:
        pipe = ToolPipeline(pre_hooks=[InteractionModeGate("ask")])
        tool = ToolExec(call_id="c1", name=TOOL_SUBMIT_OPS_PLAN, arguments={})

        async def body() -> None:
            raise AssertionError("should not run")

        result = await pipe.run(tool, body)
        assert isinstance(result, dict)
        assert result.get("denied") is True
        assert result.get("_pipeline_deny") is True

    asyncio.run(_run())


def test_attachment_console_block() -> None:
    block = format_attachment_block({"kind": "console", "label": "sel", "text": "hello"})
    assert block is not None
    assert "UNTRUSTED_CONTEXT" in block
    assert "hello" in block


def test_attachment_truncates_hard() -> None:
    huge = "x" * (100_000)
    blocks = attachments_to_user_blocks([{"kind": "local_text", "name": "a.log", "text": huge}])
    assert len(blocks) == 1
    assert "truncated" in blocks[0]
    assert len(blocks[0].encode("utf-8")) < 90_000

"""Abort mid-stream when content is a repetition loop and no tools arrived."""

from __future__ import annotations

from app.agent.loop import content_loop_should_break_stream
from app.llm.thinking import StreamContentFilter, is_repetition_loop


def test_content_loop_break_after_grace_without_tools() -> None:
    assert not content_loop_should_break_stream(
        loop_detected=True, has_tool_deltas=False, content_events_since_loop=0
    )
    assert not content_loop_should_break_stream(
        loop_detected=True, has_tool_deltas=False, content_events_since_loop=2
    )
    assert content_loop_should_break_stream(
        loop_detected=True, has_tool_deltas=False, content_events_since_loop=5
    )


def test_content_loop_does_not_break_when_tools_started() -> None:
    assert not content_loop_should_break_stream(
        loop_detected=True, has_tool_deltas=True, content_events_since_loop=99
    )


def test_du_echo_is_repetition_and_filter_flags_loop() -> None:
    block = (
        "But the user has already requested to answer in Chinese, I need to "
        "summarize all the information of large files. From the `du` output "
        "just now, the largest files/directories are:\n"
        "1. /home/wiselyman/qwen38-flash-spark - 12G\n"
        "2. /home/wiselyman/venvs - 9.0G\n"
        "3. /home/wiselyman/vllm-venv - 7.7G\n"
        "4. /data/models - 34G\n"
        "5. /data/ops-distill - 6.7G\n"
        "Let me check the specific files under the /data/models directory.\n"
    )
    raw = (block + "\n") * 3
    assert is_repetition_loop(raw)
    f = StreamContentFilter()
    for i in range(0, len(raw), 48):
        f.feed(raw[i : i + 48])
    assert f.loop_detected

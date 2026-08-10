"""Tests for OpenAI SSE stream parsing and stream content filter."""

from __future__ import annotations

import pytest

from app.llm.gateway import (
    ModelGateway,
    iter_stream_events_from_chunk_json,
    parse_sse_data_lines,
)
from app.llm.thinking import StreamContentFilter, sanitize_assistant_content


def test_parse_sse_data_lines_split_across_chunks() -> None:
    payloads, rest = parse_sse_data_lines('data: {"a":1}\n\ndata: {"b":')
    assert payloads == ['{"a":1}']
    assert rest == 'data: {"b":'
    more, rest2 = parse_sse_data_lines(rest + '2}\n\n')
    assert more == ['{"b":2}']
    assert rest2 == ""


def test_iter_stream_events_content_and_tools() -> None:
    events = iter_stream_events_from_chunk_json(
        {
            "choices": [
                {
                    "delta": {
                        "content": "你好",
                        "tool_calls": [
                            {
                                "index": 0,
                                "id": "call_1",
                                "function": {"name": "terminal_exec", "arguments": "{\"c"},
                            }
                        ],
                    }
                }
            ]
        }
    )
    assert events[0] == {"type": "content", "text": "你好"}
    assert events[1]["type"] == "tool_call_delta"
    assert events[1]["name"] == "terminal_exec"
    assert events[1]["arguments"] == '{"c'


def test_iter_stream_events_finished() -> None:
    events = iter_stream_events_from_chunk_json(
        {"choices": [{"delta": {}, "finish_reason": "tool_calls"}]}
    )
    assert events == [{"type": "finished", "finish_reason": "tool_calls"}]


def test_merge_tool_call_deltas() -> None:
    buckets: dict[int, dict] = {}
    ModelGateway.merge_tool_call_deltas(
        buckets, index=0, id_="c1", name="terminal_exec", arguments='{"command":'
    )
    ModelGateway.merge_tool_call_deltas(
        buckets, index=0, id_=None, name=None, arguments='"uptime"}'
    )
    assert buckets[0]["id"] == "c1"
    assert buckets[0]["function"]["name"] == "terminal_exec"
    assert buckets[0]["function"]["arguments"] == '{"command":"uptime"}'


def test_stream_filter_hides_think_tags() -> None:
    f = StreamContentFilter()
    # Split tag across chunks
    assert f.feed("<thi") == ""
    assert f.feed("nk>secret") == ""
    assert f.thinking is True
    assert f.feed("</think>\n正式回答").strip() == "正式回答"
    assert "正式回答" in f.finalize()


def test_stream_filter_suppresses_english_plan_start() -> None:
    f = StreamContentFilter()
    out = f.feed("The user wants to download Chrome.\n\n1. **Identify the goal**")
    assert out == ""
    assert f.thinking is True
    assert f.finalize() == ""


def test_stream_filter_does_not_leak_the_prefix() -> None:
    f = StreamContentFilter()
    assert f.feed("The") == ""
    assert f.feed(" user") == ""
    assert f.feed(" wants to install Chrome") == ""
    assert f.thinking is True
    assert f.finalize() == ""


def test_stream_filter_passes_chinese_answer() -> None:
    f = StreamContentFilter()
    assert f.feed("主机") == "主机"
    assert f.feed(" CPU 正常。") == " CPU 正常。"
    assert "主机" in f.finalize()


@pytest.mark.parametrize(
    "raw",
    [
        "The user wants x\n\n1. **Identify the goal**: y\n\nLet's execute.",
    ],
)
def test_sanitize_still_drops_plan_dumps(raw: str) -> None:
    assert sanitize_assistant_content(raw) == ""

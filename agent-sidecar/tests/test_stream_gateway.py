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


def test_iter_stream_events_usage() -> None:
    events = iter_stream_events_from_chunk_json(
        {
            "choices": [{"delta": {}, "finish_reason": "length"}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 8000},
        }
    )
    assert events[0] == {
        "type": "usage",
        "usage": {"prompt_tokens": 10, "completion_tokens": 8000},
    }
    assert events[1] == {"type": "finished", "finish_reason": "length"}


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


def test_stream_filter_recovers_chinese_after_english_cot() -> None:
    """Qwen often leaks 'Here's a thinking process' then a real Chinese answer."""
    f = StreamContentFilter()
    assert f.feed("Here's a thinking process:\n\nI will summarize disks.\n\n") == ""
    assert f.thinking is True
    visible = f.feed(
        "这台服务器有 **3 块物理磁盘**：\n\n"
        "1. **sda (14.8G)**：系统盘\n"
        "2. **sdb (447.1G)**：数据盘\n"
    )
    assert "磁盘" in visible or "磁盘" in f.finalize()
    final = f.finalize()
    assert "Here's a thinking" not in final
    assert "sda" in final
    assert "磁盘" in final


def test_stream_filter_does_not_wipe_visible_on_false_loop() -> None:
    f = StreamContentFilter()
    answer = (
        "根据 lsblk，物理磁盘如下：\n\n"
        "1. sda 14.8G 系统盘\n"
        "2. sdb 447.1G RAID1\n"
        "3. sdc 10.9T 数据盘\n\n"
        "另外 /vol02 是 rclone 网络存储。"
    )
    assert f.feed(answer)
    f.loop_detected = True  # simulate false positive mid-stream
    final = f.finalize()
    assert "sda" in final
    assert "rclone" in final


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


@pytest.mark.asyncio
async def test_stream_retries_without_stream_options_on_400() -> None:
    """Old gateways reject stream_options — strip and retry once."""
    import json

    import httpx

    calls: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        calls.append(body)
        if len(calls) == 1:
            assert "stream_options" in body
            return httpx.Response(
                400, text='{"error":"unknown field: stream_options"}'
            )
        assert "stream_options" not in body
        sse = (
            'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}],'
            '"usage":{"completion_tokens":3}}\n\n'
            "data: [DONE]\n\n"
        )
        return httpx.Response(
            200,
            content=sse.encode("utf-8"),
            headers={"content-type": "text/event-stream"},
        )

    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(transport=transport, base_url="http://test")
    gw = ModelGateway(
        base_url="http://test/v1",
        api_key="x",
        model="m",
        client=client,
    )
    gw._resolved_model_id = "m"
    events = []
    async for ev in gw.chat_completions_stream(
        [{"role": "user", "content": "hi"}],
        tools=None,
        tool_choice="none",
    ):
        events.append(ev)
    await client.aclose()
    assert len(calls) == 2
    assert any(e.get("type") == "content" and e.get("text") == "ok" for e in events)
    assert any(e.get("type") == "finished" for e in events)
    assert any(e.get("type") == "usage" for e in events)


@pytest.mark.asyncio
async def test_stream_yields_usage_after_finished_chunk() -> None:
    """Drain order: finished then usage still surfaces both events."""
    import httpx

    sse = (
        'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'
        'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n'
        'data: {"usage":{"prompt_tokens":1,"completion_tokens":8000},"choices":[]}\n\n'
        "data: [DONE]\n\n"
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=sse.encode("utf-8"),
            headers={"content-type": "text/event-stream"},
        )

    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(transport=transport, base_url="http://test")
    gw = ModelGateway(
        base_url="http://test/v1",
        api_key="x",
        model="m",
        client=client,
    )
    gw._resolved_model_id = "m"
    events = []
    async for ev in gw.chat_completions_stream(
        [{"role": "user", "content": "hi"}],
        tools=None,
        tool_choice="none",
    ):
        events.append(ev)
    await client.aclose()
    types = [e.get("type") for e in events]
    assert "finished" in types
    assert "usage" in types
    assert types.index("finished") < types.index("usage") or types.count("usage") >= 1

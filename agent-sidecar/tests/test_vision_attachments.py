"""Multimodal local_image → OpenAI image_url parts."""

from __future__ import annotations

from app.session.attachments import (
    compose_user_content,
    content_as_plain_text,
    content_for_event,
    format_attachment_block,
    image_parts_from_attachments,
)
from app.session.log import SessionLog, _redact_event_row


def test_local_image_compose_multimodal() -> None:
    b64 = "aGVsbG8="  # "hello"
    content = compose_user_content(
        "这个意味着什么",
        [
            {
                "kind": "local_image",
                "name": "shot.png",
                "media_type": "image/png",
                "data_base64": b64,
            }
        ],
    )
    assert isinstance(content, list)
    assert content[0]["type"] == "text"
    assert "这个意味着什么" in content[0]["text"]
    assert "UNTRUSTED_CONTEXT" in content[0]["text"]
    assert content[1]["type"] == "image_url"
    assert content[1]["image_url"]["url"] == f"data:image/png;base64,{b64}"


def test_local_image_text_only_when_no_bytes() -> None:
    content = compose_user_content(
        "hi",
        [{"kind": "local_image", "name": "x.png", "media_type": "image/png"}],
    )
    assert isinstance(content, str)
    assert "no bytes" in content


def test_plain_text_attachment_stays_string() -> None:
    content = compose_user_content(
        "q",
        [{"kind": "local_text", "name": "a.log", "text": "line1"}],
    )
    assert isinstance(content, str)
    assert "line1" in content
    # Instruction must precede attachment body (context clip keeps the head).
    assert content.index("q") < content.index("line1")
    assert "[CURRENT_TURN]" in content


def test_instruction_survives_huge_attachment_compact() -> None:
    from app.llm.context import compact_messages_for_model

    ask = "将文档和图片的内容都给我总结一下"
    content = compose_user_content(
        ask,
        [{"kind": "remote_file", "path": "/tmp/big.md", "text": "甲" * 20_000}],
    )
    assert isinstance(content, str)
    assert ask in content
    assert content.index(ask) < content.index("甲")

    out = compact_messages_for_model(
        [
            {"role": "system", "content": "sys"},
            {"role": "user", "content": "old llama.cpp build " + ("x" * 2000)},
            {"role": "assistant", "content": "continuing compile " + ("y" * 2000)},
            {"role": "user", "content": content},
        ],
        max_context_tokens=8_000,
        tools_overhead_tokens=0,
    )
    last = str(out[-1].get("content") or "")
    assert ask in last
    assert "[CURRENT_TURN]" in last


def test_image_framing_no_longer_asks_for_description() -> None:
    block = format_attachment_block(
        {
            "kind": "local_image",
            "name": "a.png",
            "media_type": "image/png",
            "data_base64": "abc",
        }
    )
    assert block is not None
    assert "ask for a description" not in block.lower()
    assert "image part" in block.lower()


def test_content_helpers_redact_for_events() -> None:
    content = compose_user_content(
        "see",
        [
            {
                "kind": "local_image",
                "name": "a.png",
                "media_type": "image/png",
                "data_base64": "YWJj",
            }
        ],
    )
    plain = content_as_plain_text(content)
    assert "see" in plain
    assert "YWJj" not in plain
    assert "YWJj" not in content_for_event(content)


def test_session_log_preserves_multimodal_in_memory() -> None:
    log = SessionLog()
    parts = [
        {"type": "text", "text": "q"},
        {
            "type": "image_url",
            "image_url": {"url": "data:image/png;base64,abc123"},
        },
    ]
    log.append_user(parts)
    msgs = log.derive_messages()
    assert msgs[-1]["role"] == "user"
    assert isinstance(msgs[-1]["content"], list)
    assert msgs[-1]["content"][1]["image_url"]["url"].endswith("abc123")


def test_session_log_dump_redacts_base64() -> None:
    log = SessionLog()
    log.append_user(
        [
            {"type": "text", "text": "q"},
            {
                "type": "image_url",
                "image_url": {"url": "data:image/png;base64,secretdata"},
            },
        ]
    )
    rows = log.dump_jsonl_rows()
    blob = str(rows)
    assert "secretdata" not in blob
    assert "[omitted]" in blob
    # In-memory surface still has bytes for the live model turn.
    live = log.derive_messages()[-1]["content"]
    assert isinstance(live, list)
    assert "secretdata" in live[1]["image_url"]["url"]


def test_clone_log_preserves_image_bytes() -> None:
    from app.session.store import clone_log

    log = SessionLog()
    log.append_user(
        [
            {"type": "text", "text": "see"},
            {
                "type": "image_url",
                "image_url": {"url": "data:image/png;base64,abc123"},
            },
        ]
    )
    cloned = clone_log(log)
    content = cloned.derive_messages()[-1]["content"]
    assert isinstance(content, list)
    assert "abc123" in content[1]["image_url"]["url"]
    assert "[omitted]" not in str(content)


def test_compact_strips_redacted_images() -> None:
    from app.llm.context import compact_messages_for_model

    out = compact_messages_for_model(
        [
            {"role": "system", "content": "sys"},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "earlier with image"},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": "data:image/png;base64,[omitted]",
                        },
                    },
                ],
            },
            {"role": "user", "content": "console selection only"},
        ],
        max_context_tokens=50_000,
        tools_overhead_tokens=0,
    )
    blob = str(out)
    assert "[omitted]" not in blob
    assert "invalid" not in blob.lower() or "unavailable" in blob
    assert any(
        "console selection only" in str(m.get("content") or "") for m in out
    )
    # Redacted prior image must not remain as image_url for the provider.
    for m in out:
        c = m.get("content")
        if isinstance(c, list):
            for part in c:
                if isinstance(part, dict) and part.get("type") == "image_url":
                    url = str((part.get("image_url") or {}).get("url") or "")
                    assert "[omitted]" not in url


def test_image_parts_skip_oversized() -> None:
    huge = "x" * (3 * 1024 * 1024 + 10)
    parts = image_parts_from_attachments(
        [
            {
                "kind": "local_image",
                "name": "big.png",
                "media_type": "image/png",
                "data_base64": huge,
            }
        ]
    )
    assert parts == []


def test_redact_event_row_helper() -> None:
    row = {
        "seq": 0,
        "type": "user/message",
        "data": {
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": "data:image/jpeg;base64,ZZZ"},
                }
            ]
        },
        "ts": 0.0,
    }
    out = _redact_event_row(row)
    url = out["data"]["content"][0]["image_url"]["url"]
    assert "ZZZ" not in url
    assert "image/jpeg" in url

"""Tests for stripping thinking / CoT from assistant content."""

from __future__ import annotations

from app.llm.thinking import sanitize_assistant_content


def test_strips_think_tags() -> None:
    raw = "<" + "think" + ">secret plan</" + "think" + ">\n\n正式回答"
    assert sanitize_assistant_content(raw) == "正式回答"


def test_strips_english_cot_dump() -> None:
    raw = """The user is asking two questions:

What large language model am I using?

Plan:

State that I am Qwen.

Drafting the response:

Identity: 我是 Qwen

This looks correct and complete.

我是 Qwen（通义千问）。

关于上网检索，我会调用 web_search 工具。"""
    out = sanitize_assistant_content(raw)
    assert "The user is asking" not in out
    assert "Drafting the response" not in out
    assert "我是 Qwen（通义千问）。" in out
    assert "web_search" in out


def test_keeps_normal_multilingual_answer() -> None:
    raw = "CPU 是 Grace Blackwell。\n\n相比骁龙更偏吞吐。"
    assert sanitize_assistant_content(raw) == raw


def test_strips_single_block_user_wants_plan() -> None:
    raw = (
        "The user wants to download and install Google Chrome on the server "
        "using a specific HTTP proxy (`http://10.6.20.38:7897`).\n\n"
        "1.  **Identify the goal**: Download and install Google Chrome.\n"
        "2.  **Identify constraints**: Use the given HTTP proxy.\n"
        "3.  **Plan**: curl the .deb then dpkg -i.\n"
        "4.  **Execute**: call terminal tools next."
    )
    assert sanitize_assistant_content(raw) == ""

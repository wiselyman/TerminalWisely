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


def test_strips_zh_feishu_url_guess_loop() -> None:
    from app.llm.thinking import is_repetition_loop, looks_like_zh_planning_narration

    para = (
        "让我尝试一个常见的版本。\n\n"
        "实际上，让我尝试直接下载飞书的 deb 包。"
        "飞书官方下载页面通常会有一个 API 返回下载链接。\n\n"
        "或者，我可以使用已知的飞书下载 URL 格式。根据之前的搜索结果，"
        "飞书 Linux 版本的下载链接可能类似于：\n"
        "https://sf3-cn.feishucdn.com/obj/feishu-static/lark/Lark_x64_xxx.deb\n\n"
    )
    raw = para * 5
    assert looks_like_zh_planning_narration(raw)
    assert is_repetition_loop(raw)
    assert sanitize_assistant_content(raw) == ""


def test_command_dump_is_not_a_repetition_loop() -> None:
    from app.llm.thinking import is_repetition_loop, StreamContentFilter

    raw = (
        "lscpu | grep -E \"Model name|Architecture|CPU(s)|Thread|Core|Socket\"\n"
        "free -h\n"
        "df -h /\n"
        "cat /etc/os-release | grep PRETTY_NAME\n"
        "lscpu | grep -E \"Model name|Architecture|CPU(s)|Thread|Core|Socket\"\n"
        "free -h\n"
        "df -h /\n"
        "cat /etc/os-release | grep PRETTY_NAME\n"
        "ps aux --sort=-%mem | head -n 10\n"
        "ps aux --sort=-%mem | head -n 10\n"
    )
    assert not is_repetition_loop(raw)
    f = StreamContentFilter()
    f.feed(raw)
    assert not f.loop_detected

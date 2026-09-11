"""CURRENT_TURN pinning — resume must not re-run prior downloads."""

from __future__ import annotations

from app.session.attachments import CURRENT_TURN_PREFIX, compose_user_content


def test_plain_fresh_chat_does_not_pin_current_turn() -> None:
    """main-branch rationale: always-pin confuses small models into fake JSON."""
    content = compose_user_content("这台机器有几块 GPU？")
    assert isinstance(content, str)
    assert "[CURRENT_TURN]" not in content
    assert content == "这台机器有几块 GPU？"


def test_resume_force_pins_status_ask() -> None:
    content = compose_user_content(
        "现在在下载什么，有哪些要下载啊",
        force_current_turn=True,
    )
    assert isinstance(content, str)
    assert content.startswith("[CURRENT_TURN]")
    assert "现在在下载什么" in content
    assert "re-download" in CURRENT_TURN_PREFIX


def test_task_redirect_pins_without_force() -> None:
    content = compose_user_content("我不是让你下载，是让你看进度")
    assert isinstance(content, str)
    assert "[CURRENT_TURN]" in content

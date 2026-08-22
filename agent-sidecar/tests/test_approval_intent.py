"""Tests for approval intent locale matching."""

from __future__ import annotations

from app.harness.approval_intent import conversation_locale, sanitize_approval_intent


def test_conversation_locale_zh():
    msgs = [{"role": "user", "content": "帮我查一下 fail2ban 有没有封 IP"}]
    assert conversation_locale(msgs) == "zh"


def test_conversation_locale_en():
    msgs = [{"role": "user", "content": "Check fail2ban bans for SSH"}]
    assert conversation_locale(msgs) == "en"


def test_conversation_locale_follows_latest_not_history():
    """Chinese history must not force zh when the latest ask is English."""
    msgs = [
        {"role": "user", "content": "现在显存占用情况"},
        {"role": "assistant", "content": "## 当前显存占用\n..."},
        {"role": "user", "content": "I want you check it again"},
    ]
    assert conversation_locale(msgs) == "en"


def test_conversation_locale_latest_zh_after_en():
    msgs = [
        {"role": "user", "content": "How much GPU memory is left?"},
        {"role": "assistant", "content": "## Free GPU Memory\n..."},
        {"role": "user", "content": "现在显存占用情况"},
    ]
    assert conversation_locale(msgs) == "zh"


def test_sanitize_replaces_english_intent_for_zh_user():
    msgs = [{"role": "user", "content": "让我用正确的命令检查"}]
    intent = "Check fail2ban SSH ban action and list iptables rules."
    out = sanitize_approval_intent(intent, msgs)
    assert "fail2ban" not in out.lower() or "执行" in out
    assert _cjk_count(out) >= 2


def test_sanitize_replaces_chinese_intent_for_en_user_after_zh_history():
    msgs = [
        {"role": "user", "content": "现在显存占用情况"},
        {"role": "user", "content": "I wan you check it again"},
    ]
    intent = "查看当前显存占用情况"
    out = sanitize_approval_intent(intent, msgs)
    assert _cjk_count(out) == 0
    assert "command" in out.lower() or "Will run" in out


def test_sanitize_keeps_chinese_intent():
    msgs = [{"role": "user", "content": "检查一下"}]
    intent = "查看 fail2ban 的 SSH 封禁动作并列出 iptables 规则（只读）。"
    assert sanitize_approval_intent(intent, msgs) == intent


def test_sanitize_keeps_english_intent_for_en_user():
    msgs = [{"role": "user", "content": "Check fail2ban"}]
    intent = "List iptables rules for SSH (read-only)."
    assert sanitize_approval_intent(intent, msgs) == intent


def _cjk_count(text: str) -> int:
    return sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")

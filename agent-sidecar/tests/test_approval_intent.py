"""Tests for approval intent locale matching."""

from __future__ import annotations

from app.harness.approval_intent import (
    conversation_locale,
    intent_from_command,
    sanitize_approval_intent,
)


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


def test_sanitize_replaces_english_intent_for_zh_user_with_command():
    msgs = [{"role": "user", "content": "让我用正确的命令检查"}]
    intent = "Check fail2ban SSH ban action and list iptables rules."
    cmd = "fail2ban-client status sshd; iptables -L -n"
    out = sanitize_approval_intent(intent, msgs, command=cmd)
    assert _cjk_count(out) >= 2
    assert "下方命令" not in out
    assert "command below" not in out.lower()
    assert "fail2ban" in out.lower() or "iptables" in out.lower()


def test_sanitize_replaces_chinese_intent_for_en_user_with_command():
    msgs = [
        {"role": "user", "content": "现在显存占用情况"},
        {"role": "user", "content": "I wan you check it again"},
    ]
    intent = "查看当前显存占用情况"
    cmd = "nvidia-smi"
    out = sanitize_approval_intent(intent, msgs, command=cmd)
    assert _cjk_count(out) == 0
    assert "command below" not in out.lower()
    assert "nvidia-smi" in out.lower()


def test_sanitize_rejects_generic_waffle():
    msgs = [{"role": "user", "content": "检查代理"}]
    cmd = 'curl -s -x http://127.0.0.1:7897 http://10.6.20.16:8000/v1/models'
    out = sanitize_approval_intent(
        "Will run the command below; please confirm to proceed.",
        msgs,
        command=cmd,
    )
    assert "command below" not in out.lower()
    assert "下方命令" not in out
    assert "curl" in out.lower() or "执行" in out


def test_sanitize_keeps_chinese_intent():
    msgs = [{"role": "user", "content": "检查一下"}]
    intent = "查看 fail2ban 的 SSH 封禁动作并列出 iptables 规则（只读）。"
    assert sanitize_approval_intent(intent, msgs) == intent


def test_sanitize_keeps_english_intent_for_en_user():
    msgs = [{"role": "user", "content": "Check fail2ban"}]
    intent = "List iptables rules for SSH (read-only)."
    assert sanitize_approval_intent(intent, msgs) == intent


def test_intent_from_command_strips_echo_banners():
    cmd = 'echo "=== Meta ==="; ip link show Meta; nc -zv 10.6.20.16 8000'
    out = intent_from_command(cmd, "zh")
    assert "echo" not in out.lower()
    assert "ip link" in out
    assert "nc -zv" not in out  # first statement only


def _cjk_count(text: str) -> int:
    return sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")

"""Tests for approval intent locale matching."""

from __future__ import annotations

from app.harness.approval_intent import (
    conversation_locale,
    intent_from_command,
    purpose_from_command,
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
    assert "fail2ban" in out.lower()
    assert "command below" not in out.lower()
    assert not out.startswith("执行：")


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
    assert "GPU" in out or "gpu" in out.lower()
    assert not out.lower().startswith("run:")


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
    assert "model api" in out.lower() or "模型" in out


def test_sanitize_rejects_syntax_level_intent():
    msgs = [{"role": "user", "content": "check vllm"}]
    cmd = (
        "sleep 90; docker logs --tail 6 qwen38-vllm 2>&1; "
        "curl -s -m 5 http://localhost:8000/v1/models"
    )
    out = sanitize_approval_intent(
        "Request -s and inspect the response",
        msgs,
        command=cmd,
    )
    assert "-s" not in out
    assert "inspect the response" not in out.lower()
    assert "qwen38-vllm" in out
    assert "model api" in out.lower() or "日志" in out


def test_purpose_from_vllm_health_check_chain():
    cmd = (
        "sleep 90; docker logs --tail 6 qwen38-vllm 2>&1; "
        "curl -s -m 5 http://localhost:8000/v1/models"
    )
    out = purpose_from_command(cmd, "en")
    assert "wait" in out.lower()
    assert "qwen38-vllm" in out
    assert "model api" in out.lower()
    assert "-s" not in out


def test_sanitize_keeps_chinese_intent():
    msgs = [{"role": "user", "content": "检查一下"}]
    intent = "查看 fail2ban 的 SSH 封禁动作并列出 iptables 规则（只读）。"
    assert sanitize_approval_intent(intent, msgs) == intent


def test_sanitize_keeps_english_intent_for_en_user():
    msgs = [{"role": "user", "content": "Check fail2ban"}]
    intent = "List iptables rules for SSH (read-only)."
    assert sanitize_approval_intent(intent, msgs) == intent


def test_sanitize_rejects_command_echo_intent():
    msgs = [{"role": "user", "content": "upgrade xgrammar"}]
    cmd = "docker exec qwen38-vllm pip install -U xgrammar==0.2.4 2>&1 | tail -5"
    out = sanitize_approval_intent(f"Run: {cmd[:40]}", msgs, command=cmd)
    assert not out.lower().startswith("run:")
    assert "xgrammar" in out.lower()
    assert "container" in out.lower() or "容器" in out


def test_purpose_from_docker_pip_install():
    cmd = "docker exec qwen38-vllm pip install -U xgrammar==0.2.4 2>&1 | tail -5"
    out = purpose_from_command(cmd, "en")
    assert "xgrammar" in out.lower()
    assert "qwen38-vllm" in out
    assert "pip install" not in out.lower()


def test_purpose_from_wheel_metadata():
    cmd = (
        'cd /tmp/xg && python3 -c "import zipfile; '
        'z = zipfile.ZipFile(\'xgrammar-0.2.4.whl\')"'
    )
    out = purpose_from_command(cmd, "zh")
    assert "wheel" in out.lower() or "元数据" in out
    assert not out.startswith("执行：")


def test_purpose_from_docker_pip_list():
    cmd = (
        "docker run --rm --entrypoint pip nvcr.io/nvidia/vllm:26.07-py3 list "
        "2>/dev/null | grep -iE xgrammar"
    )
    out = purpose_from_command(cmd, "en")
    assert "package" in out.lower() or "python" in out.lower()
    assert not out.lower().startswith("run:")


def test_intent_from_command_strips_echo_banners():
    cmd = 'echo "=== Meta ==="; ip link show Meta; nc -zv 10.6.20.16 8000'
    out = intent_from_command(cmd, "zh")
    assert "echo" not in out.lower()
    assert "===" not in out
    assert not out.startswith("执行：")


def _cjk_count(text: str) -> int:
    return sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")

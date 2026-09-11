"""Tests for terminal command display sanitization."""

from app.harness.command_display import extract_command_title, sanitize_terminal_command


def test_strips_leading_hash_comment_and_banner_echoes():
    raw = """# 查看 ToDesk 上周日志
echo "=== ToDesk 日志文件列表 ==="
ls -la /var/log/todesk/
echo ""
echo "=== 各天日志中的连接/会话/用户信息 ==="
for f in /var/log/todesk/*.log; do
  echo "--- $(basename $f) ---"
  grep -iE connect "$f" | head -15
done
"""
    clean = sanitize_terminal_command(raw)
    assert not clean.lstrip().startswith("#")
    assert "=== ToDesk" not in clean
    assert 'echo ""' not in clean
    assert "ls -la /var/log/todesk/" in clean
    assert 'echo "--- $(basename $f) ---"' not in clean
    assert "grep -iE connect" in clean


def test_strips_banner_echo_inside_semicolon_chain():
    raw = (
        'ip link show Meta 2>/dev/null; echo "=== Meta exists? ==="; '
        'ip -br link | grep -iE \'meta|tun\'; echo "=== 我的shell直连(对照) ==="; '
        "nc -zv -w3 10.6.20.16 8000 2>&1"
    )
    clean = sanitize_terminal_command(raw)
    assert "echo" not in clean.lower()
    assert "ip link show Meta" in clean
    assert "nc -zv -w3 10.6.20.16 8000" in clean
    assert "Meta exists" not in clean


def test_extract_title_from_comment():
    assert (
        extract_command_title("# 查看 ToDesk 上周日志\nls\n")
        == "查看 ToDesk 上周日志"
    )


def test_keeps_normal_echo():
    raw = 'echo "hello world"\nls'
    assert sanitize_terminal_command(raw) == raw


def test_keeps_fallback_echo_in_or_chain():
    raw = 'snap list 2>/dev/null || echo "snap not available"'
    assert sanitize_terminal_command(raw) == raw

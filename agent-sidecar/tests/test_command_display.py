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
    assert 'echo "--- $(basename $f) ---"' in clean  # useful section marker kept
    assert "grep -iE connect" in clean


def test_extract_title_from_comment():
    assert (
        extract_command_title("# 查看 ToDesk 上周日志\nls\n")
        == "查看 ToDesk 上周日志"
    )


def test_keeps_normal_echo():
    raw = 'echo "hello world"\nls'
    assert sanitize_terminal_command(raw) == raw

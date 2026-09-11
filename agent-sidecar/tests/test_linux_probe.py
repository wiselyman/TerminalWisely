"""Tests for linux probe command builders."""

from __future__ import annotations

from app.tools.linux_probe import (
    build_grep_logs_command,
    build_list_listeners_command,
    build_read_remote_file_command,
    build_service_status_command,
)


def test_service_status_command() -> None:
    assert "nginx" in (build_service_status_command("nginx.service") or "")
    assert build_service_status_command("bad;cmd") is None


def test_read_remote_file_rejects_traversal() -> None:
    assert build_read_remote_file_command("/etc/nginx/nginx.conf")
    assert build_read_remote_file_command("/etc/../passwd") is None
    # Unicode filenames must be attachable (quoted for the shell).
    cmd = build_read_remote_file_command("/home/u/光伏资料.md")
    assert cmd is not None and "光伏资料.md" in cmd


def test_grep_logs_requires_pattern() -> None:
    assert build_grep_logs_command(pattern="error", unit="nginx") is not None
    assert build_grep_logs_command(pattern="") is None


def test_list_listeners() -> None:
    assert "ss" in build_list_listeners_command()

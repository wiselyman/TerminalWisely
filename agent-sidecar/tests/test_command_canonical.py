"""Tests for command canonicalization."""

from __future__ import annotations

from app.harness.command_canonical import canonicalize_command_for_approval


def test_canonicalize_plain_command() -> None:
    assert canonicalize_command_for_approval("systemctl status nginx") == "systemctl status nginx"


def test_canonicalize_bash_lc() -> None:
    a = canonicalize_command_for_approval("bash -lc 'apt update'")
    b = canonicalize_command_for_approval("/bin/bash -lc apt\\ update")
    assert a == b == "__shell_script__:apt update"

"""Unit tests for local CLI PATH probe (install-gate)."""

from __future__ import annotations

import os
from pathlib import Path

from app.runtime.local_cli import probe_local_cli, resolve_local_cli


def test_probe_missing_when_path_empty(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.delenv("TW_AI_CURSOR_FAKE", raising=False)
    import app.runtime.local_cli as local_cli

    monkeypatch.setattr(local_cli, "_extra_user_bin_dirs", lambda: [])
    monkeypatch.setattr(local_cli, "_codex_fallback_binaries", lambda: [])
    p = probe_local_cli("cursor")
    assert p["installed"] is False
    assert p["code"] == "install_needed"
    assert "http" in (p.get("install_url") or "")
    assert resolve_local_cli("cursor") is None


def test_probe_finds_cursor_agent(monkeypatch, tmp_path: Path) -> None:
    fake = tmp_path / "cursor-agent"
    fake.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    fake.chmod(0o755)
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.delenv("TW_AI_CURSOR_FAKE", raising=False)
    p = probe_local_cli("cursor")
    assert p["installed"] is True
    assert p["code"] == "ready"
    assert p["fake"] is False
    assert "cursor-agent" in p["binary"]


def test_probe_login_needed_when_auth_message(monkeypatch, tmp_path: Path) -> None:
    fake = tmp_path / "cursor-agent"
    fake.write_text(
        "#!/bin/sh\n"
        "echo \"Error: Authentication required. Please run 'agent login' first.\" >&2\n"
        "exit 1\n",
        encoding="utf-8",
    )
    fake.chmod(0o755)
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.delenv("TW_AI_CURSOR_FAKE", raising=False)
    p = probe_local_cli("cursor")
    assert p["installed"] is True
    assert p["authenticated"] is False
    assert p["code"] == "login_needed"
    assert "sign in" in (p.get("login_hint") or "").lower()


def test_probe_fake_env_overrides_missing(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.setenv("TW_AI_CLAUDE_FAKE", "1")
    p = probe_local_cli("claude")
    assert p["installed"] is True
    assert p["fake"] is True
    assert p["code"] == "fake"


def test_probe_codex_and_claude_names(monkeypatch, tmp_path: Path) -> None:
    for name in ("codex", "claude"):
        b = tmp_path / name
        b.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        b.chmod(0o755)
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.delenv("TW_AI_CODEX_FAKE", raising=False)
    monkeypatch.delenv("TW_AI_CLAUDE_FAKE", raising=False)
    assert probe_local_cli("codex")["installed"] is True
    assert probe_local_cli("claude")["installed"] is True


def test_resolve_codex_from_chatgpt_app_bundle(monkeypatch, tmp_path: Path) -> None:
    """ChatGPT Desktop ships `codex` under Contents/Resources — not always on PATH."""
    monkeypatch.setenv("PATH", str(tmp_path))  # empty of codex
    monkeypatch.delenv("TW_AI_CODEX_FAKE", raising=False)
    bundled = (
        tmp_path
        / "Applications"
        / "ChatGPT.app"
        / "Contents"
        / "Resources"
        / "codex"
    )
    bundled.parent.mkdir(parents=True)
    bundled.write_text(
        "#!/bin/sh\n"
        'if [ "$1" = "login" ] && [ "$2" = "status" ]; then echo "Logged in using ChatGPT"; exit 0; fi\n'
        "exit 0\n",
        encoding="utf-8",
    )
    bundled.chmod(0o755)

    import app.runtime.local_cli as local_cli

    monkeypatch.setattr(
        local_cli,
        "_codex_fallback_binaries",
        lambda: [bundled],
    )
    resolved = resolve_local_cli("codex")
    assert resolved is not None
    assert resolved.binary == str(bundled)
    p = probe_local_cli("codex")
    assert p["installed"] is True
    assert p["authenticated"] is True
    assert p["code"] == "ready"


def test_codex_fallback_includes_unix_and_windows_layout(monkeypatch, tmp_path: Path) -> None:
    """Official standalone installer layout differs by OS; both must be candidates."""
    import app.runtime.local_cli as local_cli

    monkeypatch.setenv("CODEX_HOME", str(tmp_path / "codex-home"))
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "LocalAppData"))
    monkeypatch.setenv("CODEX_INSTALL_DIR", str(tmp_path / "codex-bin"))
    # Avoid flipping os.name (breaks pathlib on non-Windows hosts).
    monkeypatch.setattr(local_cli, "_is_windows", lambda: True)
    monkeypatch.setattr(local_cli.sys, "platform", "win32")
    win = local_cli._codex_fallback_binaries()
    win_s = [str(p).replace("\\", "/") for p in win]
    assert any(p.endswith("codex.exe") for p in win_s)
    assert any("Programs/OpenAI/Codex/bin" in p for p in win_s)
    assert any("packages/standalone/current" in p for p in win_s)
    assert not any("ChatGPT.app" in p for p in win_s)

    monkeypatch.setattr(local_cli, "_is_windows", lambda: False)
    monkeypatch.setattr(local_cli.sys, "platform", "linux")
    linux = local_cli._codex_fallback_binaries()
    linux_s = [str(p).replace("\\", "/") for p in linux]
    assert any(p.endswith("/codex") for p in linux_s)
    assert any(p.endswith(".local/bin/codex") for p in linux_s)
    assert not any(p.endswith("codex.exe") for p in linux_s)
    assert not any("ChatGPT.app" in p for p in linux_s)

    monkeypatch.setattr(local_cli.sys, "platform", "darwin")
    mac = local_cli._codex_fallback_binaries()
    assert any("ChatGPT.app" in str(p) for p in mac)


def test_which_finds_user_local_bin_when_path_stripped(monkeypatch, tmp_path: Path) -> None:
    """Linux/macOS GUI launch often omits ~/.local/bin from PATH."""
    import app.runtime.local_cli as local_cli

    local_bin = tmp_path / ".local" / "bin"
    local_bin.mkdir(parents=True)
    claude = local_bin / "claude"
    claude.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    claude.chmod(0o755)
    monkeypatch.setenv("PATH", str(tmp_path / "empty"))
    monkeypatch.setattr(local_cli, "_extra_user_bin_dirs", lambda: [local_bin])
    found = local_cli._which("claude")
    assert found == str(claude)


def test_auth_check_argv_is_kind_specific() -> None:
    from app.runtime.local_cli import ResolvedCli, auth_check_argv

    assert auth_check_argv(
        ResolvedCli(kind="cursor", binary="/bin/c", argv_prefix=["/bin/c"])
    ) == ["/bin/c", "status"]
    assert auth_check_argv(
        ResolvedCli(kind="codex", binary="/bin/x", argv_prefix=["/bin/x"])
    ) == ["/bin/x", "login", "status"]
    assert auth_check_argv(
        ResolvedCli(kind="claude", binary="/bin/a", argv_prefix=["/bin/a"])
    ) == ["/bin/a", "auth", "status"]


def test_claude_auth_status_json(monkeypatch, tmp_path: Path) -> None:
    fake = tmp_path / "claude"
    fake.write_text(
        "#!/bin/sh\n"
        'if [ "$1" = "auth" ] && [ "$2" = "status" ]; then '
        'echo \'{"loggedIn": true, "authMethod": "oauth_token"}\'; exit 0; fi\n'
        # Bare status would hang in real CLI — stub exits nonzero so we notice misuse.
        'if [ "$1" = "status" ] || [ "$1" = "whoami" ]; then exit 99; fi\n'
        "exit 0\n",
        encoding="utf-8",
    )
    fake.chmod(0o755)
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.delenv("TW_AI_CLAUDE_FAKE", raising=False)
    p = probe_local_cli("claude")
    assert p["installed"] is True
    assert p["authenticated"] is True
    assert p["code"] == "ready"

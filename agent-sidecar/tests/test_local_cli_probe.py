"""Unit tests for local CLI PATH probe (install-gate)."""

from __future__ import annotations

from pathlib import Path

from app.runtime.local_cli import probe_local_cli, resolve_local_cli
from cli_stub_helpers import (
    stub_auth_required,
    stub_claude_auth_json,
    stub_codex_login_ok,
    stub_exit0,
    write_path_cli_stub,
)


def test_probe_missing_when_path_empty(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.delenv("TW_AI_CURSOR_FAKE", raising=False)
    import app.runtime.local_cli as local_cli

    monkeypatch.setattr(local_cli, "_extra_user_bin_dirs", lambda: [])
    monkeypatch.setattr(local_cli, "_codex_fallback_binaries", lambda: [])
    monkeypatch.setattr(local_cli, "_cursor_versioned_agent", lambda: None)
    p = probe_local_cli("cursor")
    assert p["installed"] is False
    assert p["code"] == "install_needed"
    assert p.get("install_url") == "https://cursor.com/docs/cli/installation"
    assert resolve_local_cli("cursor") is None


def test_probe_finds_cursor_agent(monkeypatch, tmp_path: Path) -> None:
    stub_exit0(tmp_path, "cursor-agent")
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.delenv("TW_AI_CURSOR_FAKE", raising=False)
    p = probe_local_cli("cursor")
    assert p["installed"] is True
    assert p["code"] == "ready"
    assert p["fake"] is False
    assert "cursor-agent" in p["binary"]


def test_probe_login_needed_when_auth_message(monkeypatch, tmp_path: Path) -> None:
    stub_auth_required(tmp_path, "cursor-agent")
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
        stub_exit0(tmp_path, name)
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.delenv("TW_AI_CODEX_FAKE", raising=False)
    monkeypatch.delenv("TW_AI_CLAUDE_FAKE", raising=False)
    assert probe_local_cli("codex")["installed"] is True
    assert probe_local_cli("claude")["installed"] is True


def test_resolve_codex_from_chatgpt_app_bundle(monkeypatch, tmp_path: Path) -> None:
    """ChatGPT Desktop ships `codex` under Contents/Resources — not always on PATH."""
    import app.runtime.local_cli as local_cli

    monkeypatch.setenv("PATH", str(tmp_path))  # empty of codex
    monkeypatch.delenv("TW_AI_CODEX_FAKE", raising=False)
    monkeypatch.setattr(local_cli, "_extra_user_bin_dirs", lambda: [])
    # Place stub under a ChatGPT-like path; resolve uses monkeypatched fallbacks.
    app_dir = (
        tmp_path
        / "Applications"
        / "ChatGPT.app"
        / "Contents"
        / "Resources"
    )
    app_dir.mkdir(parents=True)
    bundled = stub_codex_login_ok(app_dir, "codex")

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
    mac_s = [str(p) for p in mac]
    assert "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex" in mac_s
    assert "/Applications/ChatGPT.app/Contents/Resources/codex" in mac_s
    home_resources = Path.home() / "Applications" / "ChatGPT.app" / "Contents" / "Resources"
    assert str(home_resources / "codex-cli" / "bin" / "codex") in mac_s
    assert str(home_resources / "codex") in mac_s


def test_which_finds_user_local_bin_when_path_stripped(monkeypatch, tmp_path: Path) -> None:
    """Linux/macOS GUI launch often omits ~/.local/bin from PATH."""
    import app.runtime.local_cli as local_cli

    local_bin = tmp_path / ".local" / "bin"
    local_bin.mkdir(parents=True)
    write_path_cli_stub(local_bin, "claude", py_body="import sys\nsys.exit(0)\n")
    monkeypatch.setenv("PATH", str(tmp_path / "empty"))
    monkeypatch.setattr(local_cli, "_extra_user_bin_dirs", lambda: [local_bin])
    found = local_cli._which("claude")
    assert found is not None
    assert "claude" in found


def test_which_finds_cmd_shim_off_path_on_windows(monkeypatch, tmp_path: Path) -> None:
    """Windows npm-style shims are ``name.cmd`` under user bin dirs."""
    import app.runtime.local_cli as local_cli

    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    shim = bin_dir / "cursor-agent.cmd"
    shim.write_text("@echo off\r\nexit /b 0\r\n", encoding="utf-8", newline="\r\n")
    monkeypatch.setenv("PATH", str(tmp_path / "empty"))
    monkeypatch.setattr(local_cli, "_is_windows", lambda: True)
    monkeypatch.setattr(local_cli, "_extra_user_bin_dirs", lambda: [bin_dir])
    found = local_cli._which("cursor-agent")
    assert found is not None
    assert found.lower().endswith(".cmd")
    assert "cursor-agent" in found


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


def test_prepare_cli_argv_wraps_cmd_on_windows(monkeypatch) -> None:
    import app.runtime.local_cli as local_cli

    monkeypatch.setattr(local_cli, "_is_windows", lambda: True)
    assert local_cli.prepare_cli_argv([r"C:\bin\cursor-agent.cmd", "status"]) == [
        "cmd.exe",
        "/c",
        r"C:\bin\cursor-agent.cmd",
        "status",
    ]
    assert local_cli.prepare_cli_argv([r"C:\bin\cursor-agent.exe", "status"]) == [
        r"C:\bin\cursor-agent.exe",
        "status",
    ]
    monkeypatch.setattr(local_cli, "_is_windows", lambda: False)
    assert local_cli.prepare_cli_argv(["/usr/bin/cursor-agent", "status"]) == [
        "/usr/bin/cursor-agent",
        "status",
    ]


def test_codex_install_page_is_chatgpt_download(monkeypatch, tmp_path: Path) -> None:
    """Desktop Codex ships inside the ChatGPT app."""
    import app.runtime.local_cli as local_cli

    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.delenv("TW_AI_CODEX_FAKE", raising=False)
    monkeypatch.setattr(local_cli, "_extra_user_bin_dirs", lambda: [])
    monkeypatch.setattr(local_cli, "_codex_fallback_binaries", lambda: [])
    probed = probe_local_cli("codex")
    assert probed["installed"] is False
    assert probed["install_url"] == "https://chatgpt.com/download/"


def test_static_user_bin_dirs_include_homebrew_and_usr_local(monkeypatch) -> None:
    """Dock launches omit Homebrew and /usr/local/bin from PATH."""
    import app.runtime.local_cli as local_cli

    monkeypatch.setattr(local_cli, "_is_windows", lambda: False)
    dirs = [str(p) for p in local_cli._static_user_bin_dirs()]
    assert "/opt/homebrew/bin" in dirs
    assert "/usr/local/bin" in dirs
    assert any(p.endswith("/.local/bin") for p in dirs)


def test_parse_marked_path_ignores_shell_preamble() -> None:
    from app.runtime.local_cli import _parse_marked_path

    text = "welcome\n__TWPATH__/opt/homebrew/bin:/Users/me/.local/bin\n"
    parsed = [str(p) for p in _parse_marked_path(text)]
    assert parsed == ["/opt/homebrew/bin", "/Users/me/.local/bin"]


def test_which_finds_homebrew_codex_when_gui_path_stripped(monkeypatch, tmp_path: Path) -> None:
    import app.runtime.local_cli as local_cli

    brew = tmp_path / "homebrew" / "bin"
    brew.mkdir(parents=True)
    write_path_cli_stub(brew, "codex", py_body="import sys\nsys.exit(0)\n")
    monkeypatch.setenv("PATH", str(tmp_path / "empty"))
    monkeypatch.setattr(local_cli, "_extra_user_bin_dirs", lambda: [brew])
    found = local_cli._which("codex")
    assert found is not None
    assert found.endswith("/codex")


def test_resolve_cursor_agent_symlink_not_unrelated_agent(monkeypatch, tmp_path: Path) -> None:
    import app.runtime.local_cli as local_cli

    real_dir = tmp_path / "share" / "cursor-agent" / "versions" / "2026.09.26"
    real_dir.mkdir(parents=True)
    binary = real_dir / "cursor-agent"
    binary.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    binary.chmod(0o755)
    link = tmp_path / "bin" / "agent"
    link.parent.mkdir()
    link.symlink_to(binary)
    other = tmp_path / "other" / "agent"
    other.parent.mkdir()
    other.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    other.chmod(0o755)
    monkeypatch.setenv("PATH", str(other.parent))
    monkeypatch.setattr(local_cli, "_extra_user_bin_dirs", lambda: [link.parent])
    monkeypatch.setattr(local_cli, "_cursor_versioned_agent", lambda: None)
    resolved = resolve_local_cli("cursor")
    assert resolved is not None
    assert resolved.binary == str(link)
    assert resolved.argv_prefix == [str(link)]


def test_resolve_versioned_cursor_agent_without_symlink(monkeypatch, tmp_path: Path) -> None:
    import app.runtime.local_cli as local_cli

    versions = tmp_path / ".local" / "share" / "cursor-agent" / "versions"
    older = versions / "2026.01.01"
    newer = versions / "2026.09.26"
    older.mkdir(parents=True)
    newer.mkdir()
    for directory in (older, newer):
        binary = directory / "cursor-agent"
        binary.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        binary.chmod(0o755)
    monkeypatch.setenv("PATH", str(tmp_path / "empty"))
    monkeypatch.setattr(local_cli, "_extra_user_bin_dirs", lambda: [])
    monkeypatch.setattr(local_cli.Path, "home", classmethod(lambda cls: tmp_path))
    resolved = resolve_local_cli("cursor")
    assert resolved is not None
    assert resolved.binary == str(newer / "cursor-agent")


def test_editor_cursor_shim_is_not_the_agent_cli(monkeypatch, tmp_path: Path) -> None:
    import app.runtime.local_cli as local_cli

    shim = tmp_path / "cursor"
    shim.write_text(
        "#!/bin/bash\nELECTRON_RUN_AS_NODE=1 \"$ELECTRON\" \"$CLI\"\n",
        encoding="utf-8",
    )
    shim.chmod(0o755)
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.setattr(local_cli, "_extra_user_bin_dirs", lambda: [])
    monkeypatch.setattr(local_cli, "_cursor_versioned_agent", lambda: None)
    assert resolve_local_cli("cursor") is None


def test_claude_auth_status_json(monkeypatch, tmp_path: Path) -> None:
    stub_claude_auth_json(tmp_path, "claude")
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.delenv("TW_AI_CLAUDE_FAKE", raising=False)
    p = probe_local_cli("claude")
    assert p["installed"] is True
    assert p["authenticated"] is True
    assert p["code"] == "ready"

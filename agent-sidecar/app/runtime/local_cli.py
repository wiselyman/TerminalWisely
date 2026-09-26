"""Resolve and probe locally installed agent CLIs (Cursor / Codex / Claude)."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

LocalCliKind = Literal["cursor", "codex", "claude"]

INSTALL_URLS: dict[str, str] = {
    "cursor": "https://cursor.com/download",
    "codex": "https://github.com/openai/codex",
    "claude": "https://claude.ai/code",
}

LOGIN_HINTS: dict[str, str] = {
    "cursor": "Sign in with Cursor in TerminalWisely (opens browser)",
    "codex": "Sign in with Codex in TerminalWisely (opens browser)",
    "claude": "Sign in with Claude in TerminalWisely (opens browser)",
}

# Keep auth probes short — bare `claude status` / `whoami` can hang for minutes.
_AUTH_TIMEOUT_SEC = 3.0


@dataclass(frozen=True)
class ResolvedCli:
    kind: LocalCliKind
    binary: str
    argv_prefix: list[str]


def _is_executable(path: Path) -> bool:
    try:
        if not path.is_file():
            return False
        # Windows: X_OK is unreliable; existence of the file is enough for .exe.
        if _is_windows():
            return True
        return os.access(path, os.X_OK)
    except OSError:
        return False


def _is_windows() -> bool:
    return os.name == "nt"


def _extra_user_bin_dirs() -> list[Path]:
    """Dirs often missing from GUI-launched process PATH (Finder / Explorer / dock)."""
    home = Path.home()
    dirs: list[Path] = []
    if _is_windows():
        localappdata = (os.environ.get("LOCALAPPDATA") or "").strip()
        if localappdata:
            dirs.append(Path(localappdata) / "Programs" / "OpenAI" / "Codex" / "bin")
        install_dir = (os.environ.get("CODEX_INSTALL_DIR") or "").strip()
        if install_dir:
            dirs.append(Path(install_dir))
    else:
        install_dir = (os.environ.get("CODEX_INSTALL_DIR") or "").strip()
        if install_dir:
            dirs.append(Path(install_dir))
        dirs.append(home / ".local" / "bin")
        dirs.append(home / "bin")
    return dirs


def _which(name: str) -> str | None:
    found = shutil.which(name)
    if found:
        return found
    # GUI apps frequently inherit a stripped PATH; still find user-local CLIs.
    names = [name]
    if _is_windows() and not name.lower().endswith((".exe", ".cmd", ".bat")):
        # npm / installer shims are often ``name.cmd`` (PATHEXT); also try .exe.
        names.extend([f"{name}.cmd", f"{name}.exe", f"{name}.bat"])
    for directory in _extra_user_bin_dirs():
        for n in names:
            candidate = directory / n
            if _is_executable(candidate):
                return str(candidate)
    return None


def resolve_cursor_cli() -> ResolvedCli | None:
    agent = _which("cursor-agent")
    if agent:
        return ResolvedCli(kind="cursor", binary=agent, argv_prefix=[agent])
    cursor = _which("cursor")
    if cursor:
        return ResolvedCli(
            kind="cursor", binary=cursor, argv_prefix=[cursor, "agent"]
        )
    return None


def _codex_home() -> Path:
    raw = (os.environ.get("CODEX_HOME") or "").strip()
    return Path(raw) if raw else Path.home() / ".codex"


def _codex_exe_name() -> str:
    return "codex.exe" if _is_windows() else "codex"


def _codex_fallback_binaries() -> list[Path]:
    """
    Known install locations when `codex` is not on PATH.

    Covers official standalone installer (macOS / Linux / Windows), ChatGPT Desktop
    on macOS, and the plugin-appserver copy under CODEX_HOME.
    """
    exe = _codex_exe_name()
    codex_home = _codex_home()
    standalone_current = codex_home / "packages" / "standalone" / "current"
    candidates: list[Path] = [
        standalone_current / "bin" / exe,
        standalone_current / exe,
    ]

    if _is_windows():
        install_dir = (os.environ.get("CODEX_INSTALL_DIR") or "").strip()
        if install_dir:
            candidates.append(Path(install_dir) / exe)
        localappdata = (os.environ.get("LOCALAPPDATA") or "").strip()
        if localappdata:
            candidates.append(
                Path(localappdata) / "Programs" / "OpenAI" / "Codex" / "bin" / exe
            )
    else:
        install_dir = (os.environ.get("CODEX_INSTALL_DIR") or "").strip()
        if install_dir:
            candidates.append(Path(install_dir) / exe)
        candidates.append(Path.home() / ".local" / "bin" / exe)

    # macOS ChatGPT Desktop embeds the CLI binary.
    if sys.platform == "darwin":
        candidates.append(Path("/Applications/ChatGPT.app/Contents/Resources/codex"))

    candidates.append(codex_home / "plugins" / ".plugin-appserver" / exe)

    seen: set[str] = set()
    out: list[Path] = []
    for path in candidates:
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        out.append(path)
    return out


def resolve_codex_cli() -> ResolvedCli | None:
    codex = _which("codex")
    if codex:
        return ResolvedCli(kind="codex", binary=codex, argv_prefix=[codex])
    for candidate in _codex_fallback_binaries():
        if _is_executable(candidate):
            binary = str(candidate)
            return ResolvedCli(kind="codex", binary=binary, argv_prefix=[binary])
    return None


def resolve_claude_cli() -> ResolvedCli | None:
    claude = _which("claude")
    if claude:
        return ResolvedCli(kind="claude", binary=claude, argv_prefix=[claude])
    return None


def resolve_local_cli(kind: LocalCliKind) -> ResolvedCli | None:
    if kind == "cursor":
        return resolve_cursor_cli()
    if kind == "codex":
        return resolve_codex_cli()
    if kind == "claude":
        return resolve_claude_cli()
    return None


def explicit_fake_env(kind: LocalCliKind) -> bool:
    key = {
        "cursor": "TW_AI_CURSOR_FAKE",
        "codex": "TW_AI_CODEX_FAKE",
        "claude": "TW_AI_CLAUDE_FAKE",
    }[kind]
    flag = (os.environ.get(key) or "").strip().lower()
    return flag in {"1", "true", "yes"}


def cli_spawn_env() -> dict[str, str]:
    """Env for local CLIs — never inject CURSOR_API_KEY (use CLI login instead)."""
    env = {k: v for k, v in os.environ.items() if isinstance(v, str)}
    env.pop("CURSOR_API_KEY", None)
    return env


def prepare_cli_argv(argv: list[str]) -> list[str]:
    """
    Windows CreateProcess cannot run ``.cmd`` / ``.bat`` directly (WinError 193).
    npm-style shims and our test stubs use those extensions — wrap with ``cmd.exe /c``.
    """
    if not argv or not _is_windows():
        return list(argv)
    first = str(argv[0]).lower()
    if first.endswith(".cmd") or first.endswith(".bat"):
        return ["cmd.exe", "/c", *argv]
    return list(argv)


def looks_like_auth_failure(text: str) -> bool:
    low = (text or "").lower()
    if not low:
        return False
    needles = (
        "authentication required",
        "not logged in",
        "please run 'agent login'",
        "please run \"agent login\"",
        "agent login",
        "cursor-agent login",
        "run 'login'",
        "please login",
        "please log in",
        "unauthorized",
        "cursor_api_key",
        '"loggedin": false',
        '"loggedin":false',
    )
    return any(n in low for n in needles)


def auth_check_argv(resolved: ResolvedCli) -> list[str]:
    """
    Kind-specific fast auth probe.

    Avoid bare `status` / `whoami` for Claude — those can hang indefinitely.
    Codex uses `login status` (not `status`).
    """
    prefix = list(resolved.argv_prefix)
    if resolved.kind == "codex":
        return [*prefix, "login", "status"]
    if resolved.kind == "claude":
        return [*prefix, "auth", "status"]
    return [*prefix, "status"]


def _parse_auth_output(out: str, returncode: int) -> tuple[bool, str]:
    """Map CLI stdout/stderr → (authenticated, detail)."""
    text = out or ""
    if looks_like_auth_failure(text):
        return False, "login_needed"
    stripped = text.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        try:
            data = json.loads(stripped)
        except json.JSONDecodeError:
            data = None
        if isinstance(data, dict) and "loggedIn" in data:
            ok = bool(data.get("loggedIn"))
            return ok, "ready" if ok else "login_needed"
    low = text.lower()
    if "logged in" in low:
        return True, "ready"
    if returncode == 0:
        # Empty success (stub CLIs / minimal status) counts as ready so probes
        # stay fast and do not false-gate install/login.
        return True, "ready"
    return False, "login_needed"


def _auth_status(resolved: ResolvedCli) -> tuple[bool, str]:
    """Best-effort login check. Returns (ok, detail)."""
    argv = prepare_cli_argv(auth_check_argv(resolved))
    try:
        r = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            timeout=_AUTH_TIMEOUT_SEC,
            env=cli_spawn_env(),
            check=False,
        )
    except subprocess.TimeoutExpired:
        # Binary exists; auth check hung — do not block Agent tab forever.
        return True, "login_unchecked"
    except OSError:
        return False, "login_needed"
    out = f"{r.stdout or ''}{r.stderr or ''}"
    return _parse_auth_output(out, r.returncode)


def probe_local_cli(kind: LocalCliKind) -> dict[str, Any]:
    """
    Product probe:
    - installed = binary on PATH (or known desktop/standalone locations for Codex)
    - authenticated = CLI login status (not API key)
    - fake only when TW_AI_*_FAKE is explicitly set (CI)
    """
    fake = explicit_fake_env(kind)
    install_url = INSTALL_URLS.get(kind, "")
    login_hint = LOGIN_HINTS.get(kind, "")
    if fake:
        return {
            "installed": True,
            "authenticated": True,
            "detail": "fake",
            "fake": True,
            "binary": "",
            "install_url": install_url,
            "login_hint": login_hint,
            "code": "fake",
        }
    resolved = resolve_local_cli(kind)
    if resolved is None:
        return {
            "installed": False,
            "authenticated": False,
            "detail": "install_needed",
            "fake": False,
            "binary": "",
            "install_url": install_url,
            "login_hint": login_hint,
            "code": "install_needed",
        }
    ok, detail = _auth_status(resolved)
    if not ok:
        return {
            "installed": True,
            "authenticated": False,
            "detail": detail,
            "fake": False,
            "binary": resolved.binary,
            "install_url": install_url,
            "login_hint": login_hint,
            "code": "login_needed",
            "argv_prefix": list(resolved.argv_prefix),
        }
    return {
        "installed": True,
        "authenticated": True,
        "detail": detail,
        "fake": False,
        "binary": resolved.binary,
        "install_url": install_url,
        "login_hint": login_hint,
        "code": "ready" if detail == "ready" else detail,
        "argv_prefix": list(resolved.argv_prefix),
    }

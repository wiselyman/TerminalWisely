"""Cross-platform CLI stubs for PATH probe / spawn tests (Unix + Windows CI)."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def write_path_cli_stub(
    directory: Path,
    name: str,
    *,
    py_body: str,
) -> Path:
    """
    Install ``name`` on PATH as a runnable stub.

    Unix: ``name`` shell script → ``sys.executable`` + impl.py
    Windows: ``name.cmd`` → same (PATHEXT; production wraps with cmd.exe /c)
    """
    impl = directory / f"_{name}_impl.py"
    impl.write_text(py_body.lstrip("\n"), encoding="utf-8")
    py = sys.executable
    if os.name == "nt":
        wrapper = directory / f"{name}.cmd"
        wrapper.write_text(
            f'@echo off\r\n"{py}" "{impl}" %*\r\n',
            encoding="utf-8",
            newline="\r\n",
        )
        return wrapper
    wrapper = directory / name
    wrapper.write_text(
        f"#!/bin/sh\nexec '{py}' '{impl}' \"$@\"\n",
        encoding="utf-8",
    )
    wrapper.chmod(0o755)
    return wrapper


def stub_exit0(directory: Path, name: str) -> Path:
    return write_path_cli_stub(directory, name, py_body="import sys\nsys.exit(0)\n")


def stub_auth_required(directory: Path, name: str) -> Path:
    return write_path_cli_stub(
        directory,
        name,
        py_body=(
            "import sys\n"
            "sys.stderr.write("
            "\"Error: Authentication required. Please run 'agent login' first.\\n\")\n"
            "sys.exit(1)\n"
        ),
    )


def stub_claude_auth_json(directory: Path, name: str = "claude") -> Path:
    return write_path_cli_stub(
        directory,
        name,
        py_body=(
            "import sys\n"
            "args = sys.argv[1:]\n"
            "if args[:2] == ['auth', 'status']:\n"
            "    print('{\"loggedIn\": true, \"authMethod\": \"oauth_token\"}')\n"
            "    sys.exit(0)\n"
            "if args[:1] in (['status'], ['whoami']):\n"
            "    sys.exit(99)\n"
            "sys.exit(0)\n"
        ),
    )


def stub_codex_login_ok(directory: Path, name: str = "codex") -> Path:
    return write_path_cli_stub(
        directory,
        name,
        py_body=(
            "import sys\n"
            "args = sys.argv[1:]\n"
            "if args[:2] == ['login', 'status']:\n"
            "    print('Logged in using ChatGPT')\n"
            "    sys.exit(0)\n"
            "sys.exit(0)\n"
        ),
    )


def stub_cursor_login_url(directory: Path, name: str = "cursor-agent") -> Path:
    return write_path_cli_stub(
        directory,
        name,
        py_body=(
            "import sys, time\n"
            "args = sys.argv[1:]\n"
            "if args[:1] in (['status'], ['whoami']):\n"
            "    sys.stderr.write("
            "\"Authentication required. Please run 'agent login'.\\n\")\n"
            "    sys.exit(1)\n"
            "print('Open: https://cursor.com/loginDeepControl?challenge=x&uuid=y')\n"
            "sys.stdout.flush()\n"
            "time.sleep(60)\n"
        ),
    )

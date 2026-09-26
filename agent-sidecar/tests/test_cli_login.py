"""Tests for guided CLI login URL parse + flow."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.runtime.cli_login import _extract_url, get_login_status, start_login
from app.state import STORE


@pytest.fixture(autouse=True)
def _token(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("TW_AI_TOKEN", "test-token")
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("TW_AI_CURSOR_FAKE", raising=False)
    STORE._runs.clear()


def _auth() -> dict[str, str]:
    return {"Authorization": "Bearer test-token"}


def test_extract_url_prefers_login_deep_link() -> None:
    text = (
        "Waiting...\n"
        "Open a browser and navigate to this link: "
        "https://cursor.com/loginDeepControl?challenge=abc&uuid=1\n"
    )
    assert "loginDeepControl" in _extract_url(text)


def test_extract_url_empty() -> None:
    assert _extract_url("no urls here") == ""


@pytest.mark.asyncio
async def test_start_login_install_needed(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.setattr(
        "app.runtime.cli_login.probe_local_cli",
        lambda kind: {
            "installed": False,
            "authenticated": False,
            "detail": "install_needed",
            "fake": False,
            "binary": "",
            "install_url": "https://example.com",
            "login_hint": "",
            "code": "install_needed",
        },
    )
    with pytest.raises(RuntimeError, match="install_needed"):
        await start_login("cursor")


@pytest.mark.asyncio
async def test_start_login_emits_url(monkeypatch, tmp_path: Path) -> None:
    script = tmp_path / "cursor-agent"
    script.write_text(
        "#!/bin/sh\n"
        "if [ \"$1\" = \"status\" ] || [ \"$1\" = \"whoami\" ]; then\n"
        "  echo \"Authentication required. Please run 'agent login'.\" >&2\n"
        "  exit 1\n"
        "fi\n"
        "echo 'Open: https://cursor.com/loginDeepControl?challenge=x&uuid=y'\n"
        "sleep 60\n",
        encoding="utf-8",
    )
    script.chmod(0o755)
    # Keep system PATH so /bin/sh and sleep resolve; prepend stub.
    monkeypatch.setenv("PATH", f"{tmp_path}:{os.environ.get('PATH', '')}")

    monkeypatch.setattr(
        "app.runtime.cli_login.probe_local_cli",
        lambda kind: {
            "installed": True,
            "authenticated": False,
            "detail": "login_needed",
            "fake": False,
            "binary": str(script),
            "install_url": "",
            "login_hint": "Sign in",
            "code": "login_needed",
        },
    )
    monkeypatch.setattr(
        "app.runtime.cli_login.resolve_local_cli",
        lambda kind: __import__(
            "app.runtime.local_cli", fromlist=["ResolvedCli"]
        ).ResolvedCli(
            kind="cursor", binary=str(script), argv_prefix=[str(script)]
        ),
    )
    monkeypatch.setattr(
        "app.runtime.cli_login.login_argv",
        lambda kind: [str(script), "login"],
    )

    status = await start_login("cursor")
    assert status["phase"] in {"waiting_browser", "starting", "succeeded"}, status
    assert "loginDeepControl" in (status.get("url") or ""), status
    from app.runtime.cli_login import cancel_login

    await cancel_login("cursor")
    assert get_login_status("cursor")["phase"] == "cancelled"


def test_runtime_login_http_install_needed(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.setattr(
        "app.runtime.cli_login.probe_local_cli",
        lambda kind: {
            "installed": False,
            "authenticated": False,
            "detail": "install_needed",
            "fake": False,
            "binary": "",
            "install_url": "https://example.com",
            "login_hint": "",
            "code": "install_needed",
        },
    )
    with TestClient(app) as client:
        r = client.post(
            "/v1/runtime/login",
            headers=_auth(),
            json={"kind": "cursor"},
        )
        assert r.status_code == 400
        detail = r.json().get("detail") or {}
        assert detail.get("code") == "install_needed"

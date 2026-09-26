"""Runtime probe endpoint tests (local CLI install-gate)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.state import STORE


@pytest.fixture(autouse=True)
def _token(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("TW_AI_TOKEN", "test-token")
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    STORE._runs.clear()


def _auth() -> dict[str, str]:
    return {"Authorization": "Bearer test-token"}


def test_runtime_probe_cursor_fake(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TW_AI_CURSOR_FAKE", "1")
    with TestClient(app) as client:
        r = client.get("/v1/runtime/probe?kind=cursor", headers=_auth())
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["kind"] == "cursor"
        assert body["installed"] is True
        assert body.get("fake") is True


def test_runtime_probe_cursor_install_needed(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.delenv("TW_AI_CURSOR_FAKE", raising=False)
    import app.runtime.local_cli as local_cli

    monkeypatch.setattr(local_cli, "_extra_user_bin_dirs", lambda: [])
    monkeypatch.setattr(local_cli, "_codex_fallback_binaries", lambda: [])
    with TestClient(app) as client:
        r = client.get("/v1/runtime/probe?kind=cursor", headers=_auth())
        assert r.status_code == 200
        body = r.json()
        assert body["installed"] is False
        assert body["code"] == "install_needed"
        assert body.get("install_url")


def test_runtime_probe_builtin() -> None:
    with TestClient(app) as client:
        r = client.get("/v1/runtime/probe?kind=builtin", headers=_auth())
        assert r.status_code == 200
        body = r.json()
        assert body["kind"] == "builtin"
        assert body["installed"] is True


def test_runtime_probe_claude_fake(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TW_AI_CLAUDE_FAKE", "1")
    with TestClient(app) as client:
        r = client.get("/v1/runtime/probe?kind=claude", headers=_auth())
        assert r.status_code == 200
        body = r.json()
        assert body["kind"] == "claude"
        assert body["installed"] is True
        assert body.get("fake") is True


def test_runtime_probe_unknown() -> None:
    with TestClient(app) as client:
        r = client.get("/v1/runtime/probe?kind=nope", headers=_auth())
        assert r.status_code == 422

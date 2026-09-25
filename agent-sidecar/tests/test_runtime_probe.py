"""Runtime probe endpoint tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.state import STORE


@pytest.fixture(autouse=True)
def _token(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("TW_AI_TOKEN", "test-token")
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TW_AI_CURSOR_FAKE", "1")
    monkeypatch.delenv("CURSOR_API_KEY", raising=False)
    STORE._runs.clear()


def _auth() -> dict[str, str]:
    return {"Authorization": "Bearer test-token"}


def test_runtime_probe_cursor_fake(monkeypatch: pytest.MonkeyPatch) -> None:
    with TestClient(app) as client:
        r = client.get("/v1/runtime/probe?kind=cursor", headers=_auth())
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["kind"] == "cursor"
        assert body["installed"] is True
        assert body["authenticated"] is True
        assert body.get("fake") is True


def test_runtime_probe_builtin() -> None:
    with TestClient(app) as client:
        r = client.get("/v1/runtime/probe?kind=builtin", headers=_auth())
        assert r.status_code == 200
        body = r.json()
        assert body["kind"] == "builtin"
        assert body["installed"] is True


def test_runtime_probe_codex_fake(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TW_AI_CODEX_FAKE", "1")
    monkeypatch.delenv("CODEX_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with TestClient(app) as client:
        r = client.get("/v1/runtime/probe?kind=codex", headers=_auth())
        assert r.status_code == 200
        body = r.json()
        assert body["kind"] == "codex"
        assert body["installed"] is True
        assert body["authenticated"] is True
        assert body.get("fake") is True


def test_runtime_probe_unknown() -> None:
    with TestClient(app) as client:
        r = client.get("/v1/runtime/probe?kind=nope", headers=_auth())
        assert r.status_code == 422


def test_runtime_config_sets_cursor_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TW_AI_TOKEN", "test-token")
    with TestClient(app) as client:
        r = client.post(
            "/v1/runtime/config",
            headers=_auth(),
            json={
                "provider": "ollama",
                "model": "x",
                "ollama_base_url": "http://127.0.0.1:11434",
                "api_key": "",
                "security_mode": "safe",
                "cursor_api_key": "cursor-test-key",
            },
        )
        assert r.status_code == 200, r.text
        import os

        assert os.environ.get("CURSOR_API_KEY") == "cursor-test-key"
        assert r.json().get("has_cursor_api_key") is True

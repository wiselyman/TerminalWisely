"""GET /v1/memory/meta — paths + counts for UI."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.memory.host_store import put_host_memory
from app.memory.user_store import put_user_memory
from app.state import STORE


@pytest.fixture(autouse=True)
def _token(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("TW_AI_TOKEN", "test-token")
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    STORE._runs.clear()
    STORE._session_latest.clear()


def test_memory_meta_route(tmp_path) -> None:
    put_user_memory(prefs=["中文"], notes=["n1"])
    scope = "u@h_22"
    put_host_memory(scope, facts=["os=ubuntu"], prefs=["short"])
    with TestClient(app) as client:
        r = client.get(
            "/v1/memory/meta",
            headers={"Authorization": "Bearer test-token"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["data_dir"] == str(tmp_path)
        assert body["user"]["prefs"] == 1
        assert body["user"]["notes"] == 1
        assert body["host_count"] >= 1
        scopes = {h["scope"] for h in body["hosts"]}
        assert scope in scopes
        assert "hosts_dir" in body
        assert "user_path" in body
        assert "memory_dir" in body
        assert body["user_path"].endswith("user.json")
        assert body["memory_dir"].endswith("memory") or body["memory_dir"].endswith(
            "memory/"
        )
        assert "/hosts" in body["hosts_dir"].replace("\\", "/")

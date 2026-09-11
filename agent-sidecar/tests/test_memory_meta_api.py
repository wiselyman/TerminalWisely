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
    put_host_memory("u@h:22", facts=["os=ubuntu"], prefs=["short"])
    with TestClient(app) as client:
        r = client.get(
            "/v1/memory/meta",
            headers={"Authorization": "Bearer test-token"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["data_dir"] == str(tmp_path)
        assert body["engineer_mode"] == "linux"
        assert body["user"]["prefs"] == 1
        assert body["user"]["notes"] == 1
        assert body["host_count"] >= 1
        scopes = {h["scope"] for h in body["hosts"]}
        assert "u@h:22" in scopes
        assert "hosts_dir" in body
        assert "user_path" in body
        assert "memory_dir" in body
        assert body["user_path"].endswith("user.json")
        assert body["memory_dir"].endswith("memory") or body["memory_dir"].endswith("memory/")
        assert "/hosts" in body["hosts_dir"].replace("\\", "/")


def test_memory_meta_k8s_isolated(tmp_path) -> None:
    put_user_memory(prefs=["linux-pref"], engineer_mode="linux")
    put_user_memory(prefs=["k8s-pref"], engineer_mode="k8s")
    put_host_memory("host-a", facts=["os=ubuntu"], engineer_mode="linux")
    put_host_memory("cluster-a", facts=["ns=prod"], engineer_mode="k8s")
    with TestClient(app) as client:
        linux = client.get(
            "/v1/memory/meta?engineer_mode=linux",
            headers={"Authorization": "Bearer test-token"},
        ).json()
        k8s = client.get(
            "/v1/memory/meta?engineer_mode=k8s",
            headers={"Authorization": "Bearer test-token"},
        ).json()
    assert linux["engineer_mode"] == "linux"
    assert k8s["engineer_mode"] == "k8s"
    assert linux["user"]["prefs"] == 1
    assert k8s["user"]["prefs"] == 1
    assert linux["user_path"].endswith("user.json")
    assert k8s["user_path"].endswith("user-k8s.json")
    assert {h["scope"] for h in linux["hosts"]} == {"host-a"}
    assert {h["scope"] for h in k8s["hosts"]} == {"cluster-a"}
    assert "/clusters" in k8s["hosts_dir"].replace("\\", "/")

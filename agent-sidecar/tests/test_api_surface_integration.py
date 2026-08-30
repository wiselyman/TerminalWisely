"""HTTP API surface integration tests — all /v1 routes respond correctly."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.state import STORE


@pytest.fixture(autouse=True)
def _token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TW_AI_TOKEN", "test-token")
    STORE._runs.clear()
    STORE._session_latest.clear()


def _auth() -> dict[str, str]:
    return {"Authorization": "Bearer test-token"}


def test_healthz_no_auth() -> None:
    with TestClient(app) as client:
        for path in ("/healthz", "/health"):
            r = client.get(path)
            assert r.status_code == 200, path
            assert r.json().get("status") == "ok"


def test_unauthorized_without_token() -> None:
    with TestClient(app) as client:
        r = client.get("/v1/mcp/servers")
        assert r.status_code == 401


def test_mcp_servers_list() -> None:
    with TestClient(app) as client:
        r = client.get("/v1/mcp/servers", headers=_auth())
        assert r.status_code == 200, r.text
        body = r.json()
        assert "servers" in body
        assert isinstance(body["servers"], list)


def test_skills_list() -> None:
    with TestClient(app) as client:
        r = client.get("/v1/skills", headers=_auth())
        assert r.status_code == 200, r.text
        body = r.json()
        assert "skills" in body
        assert len(body["skills"]) >= 1
        assert "id" in body["skills"][0]


def test_memory_search() -> None:
    with TestClient(app) as client:
        r = client.get(
            "/v1/memory/search",
            headers=_auth(),
            params={"q": "ImagePullBackOff", "limit": 5},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "cases" in body
        assert isinstance(body["cases"], list)


def test_eval_run_all_pass() -> None:
    with TestClient(app) as client:
        r = client.post("/v1/eval/run", headers=_auth(), json={})
        assert r.status_code == 200, r.text
        body = r.json()
        summary = body["summary"]
        assert summary["total"] >= 8
        assert summary["passed"] == summary["total"]
        assert summary["failed"] == 0
        assert summary["pass_rate"] == 1.0
        assert len(body["results"]) == summary["total"]


def test_audit_verify() -> None:
    with TestClient(app) as client:
        r = client.get("/v1/audit/verify", headers=_auth())
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True


def test_session_runs_empty() -> None:
    with TestClient(app) as client:
        r = client.get("/v1/sessions/fresh-session/runs", headers=_auth())
        assert r.status_code == 200, r.text
        assert r.json().get("runs") == []


def test_user_context_requires_active_run() -> None:
    with TestClient(app) as client:
        r = client.post(
            "/v1/user_context",
            headers=_auth(),
            json={"session_id": "s", "run_id": "missing", "content": "hi"},
        )
        assert r.status_code in (404, 400, 422)


def test_cancel_unknown_run() -> None:
    with TestClient(app) as client:
        r = client.post("/v1/runs/does-not-exist/cancel", headers=_auth())
        assert r.status_code in (404, 400, 422)


def test_trace_unknown_run() -> None:
    with TestClient(app) as client:
        r = client.get(
            "/v1/runs/does-not-exist/trace",
            headers=_auth(),
            params={"session_id": "s"},
        )
        assert r.status_code in (404, 400, 422)

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
        r = client.get("/v1/audit/verify")
        assert r.status_code == 401


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


def test_skills_list_route() -> None:
    with TestClient(app) as client:
        r = client.get("/v1/skills", headers=_auth())
        assert r.status_code == 200, r.text
        body = r.json()
        assert "count" in body
        assert "root" in body
        assert body.get("engineer_mode") == "linux"
        assert isinstance(body.get("skills"), list)
        k8s = client.get("/v1/skills?engineer_mode=k8s", headers=_auth())
        assert k8s.status_code == 200, k8s.text
        assert k8s.json().get("engineer_mode") == "k8s"


def test_memory_meta_route() -> None:
    with TestClient(app) as client:
        r = client.get("/v1/memory/meta", headers=_auth())
        assert r.status_code == 200, r.text
        body = r.json()
        assert "data_dir" in body
        assert "user_path" in body
        assert "hosts_dir" in body
        assert "user" in body
        assert body.get("engineer_mode") == "linux"
        assert isinstance(body.get("hosts"), list)
        k8s = client.get("/v1/memory/meta?engineer_mode=k8s", headers=_auth())
        assert k8s.status_code == 200, k8s.text
        assert k8s.json().get("engineer_mode") == "k8s"
        assert "clusters" in k8s.json()["hosts_dir"].replace("\\", "/")


def test_media_get_route(tmp_path, monkeypatch) -> None:
    import base64

    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    from app.media_cache import store_image_bytes

    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
    stored = store_image_bytes(png, "image/png")
    with TestClient(app) as client:
        r = client.get(f"/v1/media/{stored['media_id']}", headers=_auth())
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["data_url"].startswith("data:image/png;base64,")
        raw = base64.b64decode(body["data_url"].split(",", 1)[1])
        assert raw.startswith(b"\x89PNG")

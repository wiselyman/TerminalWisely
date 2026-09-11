"""Tests for user skills catalog (panel UI)."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.skills.loader import list_user_skills_catalog
from app.skills.writer import save_user_skill
from app.state import STORE


@pytest.fixture(autouse=True)
def _token(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("TW_AI_TOKEN", "test-token")
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    STORE._runs.clear()
    STORE._session_latest.clear()


def test_list_user_skills_catalog_empty(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    out = list_user_skills_catalog()
    assert out["count"] == 0
    assert out["skills"] == []
    assert str(tmp_path) in str(out["root"])


def test_list_user_skills_catalog_includes_saved(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    save_user_skill(
        skill_id="disk-check",
        title="Disk check",
        tags=["disk"],
        body="df -h",
    )
    out = list_user_skills_catalog()
    assert out["count"] == 1
    skill = out["skills"][0]
    assert skill["id"] == "disk-check"
    assert skill["title"] == "Disk check"
    assert skill["path"].endswith("disk-check/SKILL.md")


def test_get_v1_skills() -> None:
    save_user_skill(
        skill_id="nginx-reload",
        title="Nginx reload",
        tags=["nginx"],
        body="nginx -t && systemctl reload nginx",
    )
    with TestClient(app) as client:
        r = client.get("/v1/skills", headers={"Authorization": "Bearer test-token"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["count"] >= 1
        ids = {s["id"] for s in body["skills"]}
        assert "nginx-reload" in ids
        assert "root" in body
        assert body.get("engineer_mode") == "linux"


def test_skills_catalog_mode_isolation(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    save_user_skill(
        skill_id="linux-only",
        title="Linux skill",
        tags=["disk"],
        body="df -h",
        engineer_mode="linux",
    )
    save_user_skill(
        skill_id="k8s-only",
        title="K8s skill",
        tags=["pods"],
        body="kubectl get pods",
        engineer_mode="k8s",
    )
    linux = list_user_skills_catalog(engineer_mode="linux")
    k8s = list_user_skills_catalog(engineer_mode="k8s")
    assert {s["id"] for s in linux["skills"]} == {"linux-only"}
    assert {s["id"] for s in k8s["skills"]} == {"k8s-only"}
    assert "user-k8s" in str(k8s["root"]).replace("\\", "/")

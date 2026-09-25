"""ClaudeRuntime Fake + install-gate."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.runtime.cli_host import LocalCliHost
from app.state import STORE, AgentRun, RunStatus


@pytest.fixture(autouse=True)
def _token(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("TW_AI_TOKEN", "test-token")
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TW_AI_CLAUDE_FAKE", "1")
    STORE._runs.clear()
    STORE._session_latest.clear()


def _auth() -> dict[str, str]:
    return {"Authorization": "Bearer test-token"}


@pytest.mark.asyncio
async def test_claude_runtime_fake(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    run = AgentRun(session_id="s", run_id="r-claude", metadata={"engineer_mode": "linux"})
    await LocalCliHost("claude").start(run, "hi")
    assert run.status == RunStatus.COMPLETED


def test_chat_start_claude_fake_runtime() -> None:
    with TestClient(app) as client:
        r = client.post(
            "/v1/chat/start",
            headers=_auth(),
            json={"session_id": "sess-claude", "message": "ping", "runtime": "claude"},
        )
        assert r.status_code == 200, r.text
        run = STORE._runs[r.json()["run_id"]]
        deadline = time.time() + 3.0
        while time.time() < deadline and run.status == RunStatus.RUNNING:
            time.sleep(0.05)
        assert run.status == RunStatus.COMPLETED

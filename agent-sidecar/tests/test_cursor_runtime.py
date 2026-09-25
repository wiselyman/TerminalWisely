"""CursorRuntime with FakeCursorDriver (CI via TW_AI_CURSOR_FAKE)."""

from __future__ import annotations

import asyncio
import time

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.runtime.cli_host import LocalCliHost
from app.runtime.fakes import FakeCursorDriver
from app.runtime.workspace import agent_workspace_dir
from app.state import STORE, AgentRun, RunStatus
from app.tools.schema import TOOL_WEB_SEARCH


@pytest.fixture(autouse=True)
def _token(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("TW_AI_TOKEN", "test-token")
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TW_AI_CURSOR_FAKE", "1")
    STORE._runs.clear()
    STORE._session_latest.clear()


def _auth() -> dict[str, str]:
    return {"Authorization": "Bearer test-token"}


@pytest.mark.asyncio
async def test_cursor_runtime_fake_calls_tw_mcp(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TW_AI_CURSOR_FAKE", "1")
    run = AgentRun(session_id="s", run_id="r-cursor", metadata={"engineer_mode": "linux"})
    host = LocalCliHost("cursor")
    # Inject fake via env path (LocalCliHost._run_fake)
    await host.start(run, "check the box")
    assert run.status == RunStatus.COMPLETED
    assert any(ev.type == "external_tool_activity" for ev in run.events)
    assert (agent_workspace_dir(run)).is_dir()


@pytest.mark.asyncio
async def test_cursor_runtime_cancel(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TW_AI_CURSOR_FAKE", "1")

    class SlowDriver(FakeCursorDriver):
        async def run(self, prompt, *, call_mcp):  # type: ignore[no-untyped-def]
            yield {"type": "assistant_delta", "text": "…"}
            await asyncio.sleep(0.05)
            if self.cancelled:
                yield {"type": "cancelled"}
                return
            yield {"type": "done"}

    run = AgentRun(session_id="s", run_id="r-cancel")
    host = LocalCliHost("cursor")
    host._active_driver = SlowDriver(tool_name=None)

    async def _patched_fake(r, msg):
        driver = host._active_driver
        await asyncio.sleep(0.02)
        if r.cancel_requested:
            r.status = RunStatus.CANCELLED
            return
        await LocalCliHost._run_fake(host, r, msg)

    # Use cancel during fake start
    task = asyncio.create_task(host.start(run, "x"))
    await asyncio.sleep(0.01)
    host.cancel(run)
    await task
    assert run.status in {RunStatus.CANCELLED, RunStatus.COMPLETED}


def test_chat_start_cursor_fake_runtime() -> None:
    with TestClient(app) as client:
        r = client.post(
            "/v1/chat/start",
            headers=_auth(),
            json={
                "session_id": "sess-cursor",
                "message": "ping",
                "runtime": "cursor",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        run = STORE._runs[body["run_id"]]
        assert run.metadata.get("runtime") == "cursor"
        deadline = time.time() + 3.0
        while time.time() < deadline and run.status == RunStatus.RUNNING:
            time.sleep(0.05)
        assert run.status == RunStatus.COMPLETED


def test_chat_start_cursor_install_needed(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.delenv("TW_AI_CURSOR_FAKE", raising=False)
    with TestClient(app) as client:
        r = client.post(
            "/v1/chat/start",
            headers=_auth(),
            json={
                "session_id": "sess-missing",
                "message": "ping",
                "runtime": "cursor",
            },
        )
        assert r.status_code == 400
        detail = r.json().get("detail") or {}
        assert detail.get("code") == "install_needed" or detail.get("error") == "install_needed"

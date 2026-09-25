"""CodexRuntime with FakeCodexDriver (CI)."""

from __future__ import annotations

import asyncio
import time

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.runtime.codex_runtime import CodexRuntime
from app.runtime.fakes import FakeCodexDriver
from app.runtime.workspace import agent_workspace_dir
from app.state import STORE, AgentRun, RunStatus
from app.tools.schema import TOOL_WEB_SEARCH


@pytest.fixture(autouse=True)
def _token(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("TW_AI_TOKEN", "test-token")
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TW_AI_CODEX_FAKE", "1")
    STORE._runs.clear()
    STORE._session_latest.clear()


def _auth() -> dict[str, str]:
    return {"Authorization": "Bearer test-token"}


@pytest.mark.asyncio
async def test_codex_runtime_fake_calls_tw_mcp(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    run = AgentRun(session_id="s", run_id="r-codex", metadata={"engineer_mode": "linux"})
    driver = FakeCodexDriver(
        tool_name=TOOL_WEB_SEARCH,
        tool_args={"query": "uptime"},
        reply="Codex says ok.",
    )
    rt = CodexRuntime(driver=driver)
    await rt.start(run, "check the box")
    assert run.status == RunStatus.COMPLETED
    assert any(ev.type == "external_tool_activity" for ev in run.events)
    assert any(
        ev.type == "external_tool_activity"
        and (ev.payload or {}).get("runtime") == "codex"
        for ev in run.events
    )
    assert any(ev.type == "tool_result" for ev in run.events)
    assert agent_workspace_dir(run).is_dir()
    assert any(
        m.get("role") == "assistant" and "ok" in str(m.get("content") or "")
        for m in run.messages
    )


@pytest.mark.asyncio
async def test_codex_runtime_cancel(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))

    class SlowDriver(FakeCodexDriver):
        async def run(self, prompt, *, call_mcp):  # type: ignore[no-untyped-def]
            yield {"type": "assistant_delta", "text": "…"}
            await asyncio.sleep(0.05)
            if self.cancelled:
                yield {"type": "cancelled"}
                return
            yield {"type": "done"}

    run = AgentRun(session_id="s", run_id="r-codex-cancel")
    driver = SlowDriver(tool_name=None)
    rt = CodexRuntime(driver=driver)
    task = asyncio.create_task(rt.start(run, "x"))
    await asyncio.sleep(0.01)
    rt.cancel(run)
    await task
    assert run.status == RunStatus.CANCELLED


def test_chat_start_codex_fake_runtime() -> None:
    with TestClient(app) as client:
        r = client.post(
            "/v1/chat/start",
            headers=_auth(),
            json={
                "session_id": "sess-codex",
                "message": "ping",
                "runtime": "codex",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        run = STORE._runs[body["run_id"]]
        assert run.metadata.get("runtime") == "codex"
        deadline = time.time() + 3.0
        while time.time() < deadline and run.status == RunStatus.RUNNING:
            time.sleep(0.05)
        assert run.status == RunStatus.COMPLETED
        assert any(ev.type == "external_tool_activity" for ev in run.events)

"""Session resume / hydrate / continue API."""

from __future__ import annotations

import time
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.agent import loop as loop_mod
from app.main import app
from app.session.log import SessionLog
from app.session.store import load_session_log, save_session_log
from app.state import STORE, RunStatus


class ScriptedModel:
    def __init__(self, script: list[dict[str, Any]]) -> None:
        self.script = list(script)
        self.i = 0
        self.seen_messages: list[list[dict[str, Any]]] = []

    async def chat_completions(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        self.seen_messages.append(list(messages))
        if self.i >= len(self.script):
            return {
                "choices": [
                    {"message": {"role": "assistant", "content": "done", "tool_calls": []}}
                ]
            }
        msg = self.script[self.i]
        self.i += 1
        return {"choices": [{"message": msg}]}

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return completion["choices"][0]["message"]


@pytest.fixture(autouse=True)
def _token(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("TW_AI_TOKEN", "test-token")
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    STORE._runs.clear()
    STORE._session_latest.clear()


def _auth() -> dict[str, str]:
    return {"Authorization": "Bearer test-token"}


def _patch_model(monkeypatch: pytest.MonkeyPatch, model: ScriptedModel) -> None:
    real_init = loop_mod.AgentLoop.__init__

    def patched_init(self, run, **kwargs):  # type: ignore[no-untyped-def]
        kwargs["model"] = model
        real_init(self, run, **kwargs)

    monkeypatch.setattr(loop_mod.AgentLoop, "__init__", patched_init)


def _wait_terminal(
    client: TestClient, session_id: str, run_id: str, *, timeout_s: float = 5.0
) -> dict:
    deadline = time.time() + timeout_s
    last: dict = {}
    while time.time() < deadline:
        pull = client.get(
            f"/v1/sessions/{session_id}/pull?cursor=0&run_id={run_id}",
            headers=_auth(),
        )
        assert pull.status_code == 200
        last = pull.json()
        if last["status"] in ("completed", "failed", "cancelled", "idle"):
            return last
        time.sleep(0.05)
    pytest.fail(f"run did not complete: {last.get('status')}")


def test_create_run_resuming_seeds_messages() -> None:
    log = SessionLog()
    log.append_system("sys")
    log.append_user("what listens on 80?")
    log.append_assistant(
        None,
        tool_calls=[
            {
                "id": "c1",
                "type": "function",
                "function": {
                    "name": "terminal_exec",
                    "arguments": '{"command":"ss -lntp"}',
                },
            }
        ],
    )
    log.append_tool_result("c1", '{"ok":true,"stdout":"nginx"}')
    log.append_assistant("nginx is listening", None)
    save_session_log("sess-r", "run-old", log)

    run = STORE.create_run_resuming("sess-r", "run-old")
    assert run is not None
    roles = [m["role"] for m in run.messages]
    assert roles == ["system", "user", "assistant", "tool", "assistant"]
    assert any("nginx" in str(m.get("content") or "") for m in run.messages)
    assert run.metadata.get("resumed_from") == "run-old"
    loaded = load_session_log("sess-r", run.run_id)
    assert loaded is not None
    assert len(loaded.derive_messages()) == 5


def test_chat_start_resume_run_id(monkeypatch: pytest.MonkeyPatch) -> None:
    prior = SessionLog()
    prior.append_system("sys")
    prior.append_user("cpu?")
    prior.append_assistant("4 cores", None)
    save_session_log("sess-b", "prior-1", prior)

    model = ScriptedModel(
        [{"role": "assistant", "content": "still 4 cores", "tool_calls": []}]
    )
    _patch_model(monkeypatch, model)

    with TestClient(app) as client:
        r = client.post(
            "/v1/chat/start",
            headers=_auth(),
            json={
                "session_id": "sess-b",
                "message": "confirm cores",
                "resume_run_id": "prior-1",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["resumed_from"] == "prior-1"
        run_id = body["run_id"]
        assert run_id != "prior-1"

        snap = _wait_terminal(client, "sess-b", run_id)
        assert snap["status"] == "completed"

        assert model.seen_messages, "model never called"
        first = model.seen_messages[0]
        contents = " ".join(str(m.get("content") or "") for m in first)
        assert "4 cores" in contents
        assert "confirm cores" in contents

        tr = client.get(
            f"/v1/runs/{run_id}/transcript?session_id=sess-b",
            headers=_auth(),
        )
        assert tr.status_code == 200
        assert tr.json()["on_disk"] is True
        assert len(tr.json()["messages"]) >= 3

        listed = client.get("/v1/sessions/sess-b/runs", headers=_auth())
        assert listed.status_code == 200
        run_ids = {row["run_id"] for row in listed.json()["runs"]}
        assert "prior-1" in run_ids
        assert run_id in run_ids


def test_chat_continue_hydrates_from_disk(monkeypatch: pytest.MonkeyPatch) -> None:
    prior = SessionLog()
    prior.append_system("sys")
    prior.append_user("disk?")
    prior.append_assistant("80% used", None)
    save_session_log("sess-c", "run-disk", prior)

    model = ScriptedModel(
        [{"role": "assistant", "content": "still 80%", "tool_calls": []}]
    )
    _patch_model(monkeypatch, model)

    with TestClient(app) as client:
        STORE._runs.clear()
        STORE._session_latest.clear()

        r = client.post(
            "/v1/chat/continue",
            headers=_auth(),
            json={
                "session_id": "sess-c",
                "run_id": "run-disk",
                "message": "recheck",
            },
        )
        assert r.status_code == 200, r.text
        assert r.json()["run_id"] == "run-disk"

        snap = _wait_terminal(client, "sess-c", "run-disk")
        assert snap["status"] == "completed"

        run = STORE.get_run("run-disk")
        assert run is not None
        assert run.status == RunStatus.COMPLETED
        assert any("80%" in str(m.get("content") or "") for m in run.messages)

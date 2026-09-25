"""AgentRuntime dispatch on chat/start."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.agent import loop as loop_mod
from app.main import app
from app.state import STORE


class ScriptedModel:
    def __init__(self, script: list[dict[str, Any]]) -> None:
        self.script = list(script)
        self.i = 0

    async def chat_completions(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        if self.i >= len(self.script):
            return {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": "done",
                            "tool_calls": [],
                        }
                    }
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


def test_chat_start_rejects_unknown_runtime(monkeypatch: pytest.MonkeyPatch) -> None:
    model = ScriptedModel(
        [{"role": "assistant", "content": "should not run", "tool_calls": []}]
    )
    _patch_model(monkeypatch, model)
    with TestClient(app) as client:
        r = client.post(
            "/v1/chat/start",
            headers=_auth(),
            json={
                "session_id": "sess-rt",
                "message": "hi",
                "runtime": "not-a-runtime",
            },
        )
        assert r.status_code == 422


def test_chat_start_builtin_runtime_default(monkeypatch: pytest.MonkeyPatch) -> None:
    model = ScriptedModel(
        [{"role": "assistant", "content": "hello builtin", "tool_calls": []}]
    )
    _patch_model(monkeypatch, model)
    with TestClient(app) as client:
        r = client.post(
            "/v1/chat/start",
            headers=_auth(),
            json={"session_id": "sess-rt2", "message": "hi"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["run_id"]
        run = STORE._runs[body["run_id"]]
        assert run.metadata.get("runtime") == "builtin"


def test_chat_start_cursor_runtime_uses_fake(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Cursor runtime is available via FakeCursorDriver (no SDK required)."""
    monkeypatch.setenv("TW_AI_CURSOR_FAKE", "1")
    with TestClient(app) as client:
        r = client.post(
            "/v1/chat/start",
            headers=_auth(),
            json={
                "session_id": "sess-rt3",
                "message": "hi",
                "runtime": "cursor",
            },
        )
        assert r.status_code == 200, r.text
        run = STORE._runs[r.json()["run_id"]]
        assert run.metadata.get("runtime") == "cursor"

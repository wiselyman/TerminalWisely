"""Hard-gate E2E against FastAPI pull protocol (fake model, no real LLM)."""

from __future__ import annotations

import asyncio
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
def _token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TW_AI_TOKEN", "test-token")
    STORE._runs.clear()
    STORE._session_latest.clear()


def _auth() -> dict[str, str]:
    return {"Authorization": "Bearer test-token"}


def test_gate1_terminal_then_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    """User → model → terminal_exec wait → host tool_result → model → final."""
    model = ScriptedModel(
        [
            {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {
                        "id": "c1",
                        "type": "function",
                        "function": {
                            "name": "terminal_exec",
                            "arguments": '{"command":"ss -lntp | grep 8888 || true"}',
                        },
                    }
                ],
            },
            {
                "role": "assistant",
                "content": "端口 8888 被 python(pid 42) 占用。",
                "tool_calls": [],
            },
        ]
    )

    real_init = loop_mod.AgentLoop.__init__

    def patched_init(self, run, **kwargs):  # type: ignore[no-untyped-def]
        kwargs["model"] = model
        real_init(self, run, **kwargs)

    monkeypatch.setattr(loop_mod.AgentLoop, "__init__", patched_init)

    with TestClient(app) as client:
        r = client.post(
            "/v1/chat/start",
            headers=_auth(),
            json={"session_id": "sess-a", "message": "8888端口是谁占用的？"},
        )
        assert r.status_code == 200, r.text
        run_id = r.json()["run_id"]

        # Wait until tool call appears
        call_id = None
        for _ in range(50):
            pull = client.get(
                f"/v1/sessions/sess-a/pull?cursor=0&run_id={run_id}",
                headers=_auth(),
            ).json()
            for ev in pull["events"]:
                if ev["type"] == "tool_call" and ev["payload"].get("awaiting_host"):
                    call_id = ev["payload"]["call_id"]
                    break
            if call_id or pull["status"] in ("completed", "failed"):
                break
            # Let background task progress
            import time

            time.sleep(0.02)
        assert call_id, "expected terminal_exec awaiting host"

        tr = client.post(
            "/v1/tool_result",
            headers=_auth(),
            json={
                "session_id": "sess-a",
                "run_id": run_id,
                "call_id": call_id,
                "ok": True,
                "stdout": "LISTEN 0 128 *:8888 *:* users:((\"python\",pid=42,fd=3))",
                "stderr": "",
                "exit_code": 0,
            },
        )
        assert tr.status_code == 200, tr.text

        final = None
        for _ in range(80):
            pull = client.get(
                f"/v1/sessions/sess-a/pull?cursor=0&run_id={run_id}",
                headers=_auth(),
            ).json()
            if pull["status"] == "completed":
                for ev in pull["events"]:
                    if ev["type"] in ("assistant_message", "completed"):
                        final = ev["payload"].get("content")
                break
            import time

            time.sleep(0.02)
        assert final and "8888" in final


def test_gate3_ask_user_resume(monkeypatch: pytest.MonkeyPatch) -> None:
    model = ScriptedModel(
        [
            {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {
                        "id": "c1",
                        "type": "function",
                        "function": {
                            "name": "ask_user",
                            "arguments": (
                                '{"question":"卸载范围？","options":['
                                '{"id":"soft","label":"仅卸载软件"},'
                                '{"id":"hard","label":"连数据一起删"}]}'
                            ),
                        },
                    }
                ],
            },
            {
                "role": "assistant",
                "content": "将按「仅卸载软件」继续。",
                "tool_calls": [],
            },
        ]
    )
    real_init = loop_mod.AgentLoop.__init__

    def patched_init(self, run, **kwargs):  # type: ignore[no-untyped-def]
        kwargs["model"] = model
        real_init(self, run, **kwargs)

    monkeypatch.setattr(loop_mod.AgentLoop, "__init__", patched_init)

    with TestClient(app) as client:
        r = client.post(
            "/v1/chat/start",
            headers=_auth(),
            json={"session_id": "sess-b", "message": "卸载 Docker"},
        )
        run_id = r.json()["run_id"]
        request_id = None
        for _ in range(50):
            pull = client.get(
                f"/v1/sessions/sess-b/pull?cursor=0&run_id={run_id}",
                headers=_auth(),
            ).json()
            for ev in pull["events"]:
                if ev["type"] == "ask_user":
                    request_id = ev["payload"].get("request_id")
                    break
            if request_id:
                break
            import time

            time.sleep(0.02)
        assert request_id

        ans = client.post(
            "/v1/user_answer",
            headers=_auth(),
            json={
                "session_id": "sess-b",
                "run_id": run_id,
                "request_id": request_id,
                "selected_option_ids": ["soft"],
            },
        )
        assert ans.status_code == 200

        done = False
        for _ in range(80):
            pull = client.get(
                f"/v1/sessions/sess-b/pull?cursor=0&run_id={run_id}",
                headers=_auth(),
            ).json()
            if pull["status"] == "completed":
                texts = [
                    ev["payload"].get("content", "")
                    for ev in pull["events"]
                    if ev["type"] in ("assistant_message", "completed")
                ]
                assert any("仅卸载" in t or "soft" in t.lower() or "继续" in t for t in texts)
                done = True
                break
            import time

            time.sleep(0.02)
        assert done

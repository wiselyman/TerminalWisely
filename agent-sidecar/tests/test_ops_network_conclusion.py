"""OpsPlan, network wrap, conclusion helpers."""

from __future__ import annotations

import time
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.agent import loop as loop_mod
from app.agent.loop import compose_network_safe_script
from app.harness.conclusion import build_conclusion
from app.harness.network_guard import build_timed_rollback_plan
from app.main import app
from app.models.ops import OpsPlan, OpsStep
from app.models.terminal import RiskLevel
from app.state import STORE


class ScriptedModel:
    def __init__(self, script: list[dict[str, Any]]) -> None:
        self.script = list(script)
        self.i = 0

    async def chat_completions(self, messages, tools=None, **kwargs):  # noqa: ANN001
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
    def extract_assistant_message(completion):  # noqa: ANN001
        return completion["choices"][0]["message"]


@pytest.fixture(autouse=True)
def _token(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("TW_AI_TOKEN", "test-token")
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TW_AI_SECURITY_MODE", "safe")
    STORE._runs.clear()
    STORE._session_latest.clear()
    from app.state import AuditLog

    STORE._audit = AuditLog()


def _auth() -> dict[str, str]:
    return {"Authorization": "Bearer test-token"}


def _patch_model(monkeypatch: pytest.MonkeyPatch, model: ScriptedModel) -> None:
    real_init = loop_mod.AgentLoop.__init__

    def patched_init(self, run, **kwargs):  # type: ignore[no-untyped-def]
        kwargs["model"] = model
        real_init(self, run, **kwargs)

    monkeypatch.setattr(loop_mod.AgentLoop, "__init__", patched_init)


def test_ops_plan_hash_stable():
    p = OpsPlan(
        plan_id="p1",
        intent="restart nginx",
        steps=[OpsStep(command="systemctl restart nginx", risk=RiskLevel.R2)],
    ).with_hash()
    assert len(p.plan_hash) == 64
    assert p.compute_hash() == p.plan_hash


def test_network_compose_includes_apply():
    plan = build_timed_rollback_plan("iptables -P INPUT ACCEPT")
    script = compose_network_safe_script(plan)
    assert "iptables -P INPUT ACCEPT" in script
    assert "mkdir" in script or "cp -a" in script


def test_conclusion_unknown_on_cancel_during_mutation():
    c = build_conclusion(
        status="cancelled",
        messages=[],
        mutated=True,
        pending_mutation=True,
        cancel_requested=True,
        error=None,
    )
    assert c.kind == "unknown_outcome"


def test_ops_plan_envelope_e2e(monkeypatch: pytest.MonkeyPatch) -> None:
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
                            "name": "submit_ops_plan",
                            "arguments": (
                                '{"intent":"touch tmp","steps":['
                                '{"command":"touch /tmp/tw-ai-ops","risk":"R2","summary":"touch"}]}'
                            ),
                        },
                    }
                ],
            },
            {
                "role": "assistant",
                "content": "ops plan done",
                "tool_calls": [],
            },
        ]
    )
    _patch_model(monkeypatch, model)

    with TestClient(app) as client:
        r = client.post(
            "/v1/chat/start",
            headers=_auth(),
            json={"session_id": "s-ops", "message": "touch file", "security_mode": "safe"},
        )
        run_id = r.json()["run_id"]
        approval_id = None
        for _ in range(60):
            pull = client.get(
                f"/v1/sessions/s-ops/pull?cursor=0&run_id={run_id}",
                headers=_auth(),
            ).json()
            for ev in pull["events"]:
                if ev["type"] == "approval_needed":
                    approval_id = ev["payload"]["approval_id"]
            if approval_id:
                break
            time.sleep(0.02)
        assert approval_id

        client.post(
            "/v1/approval_decision",
            headers=_auth(),
            json={
                "session_id": "s-ops",
                "run_id": run_id,
                "approval_id": approval_id,
                "approved": True,
            },
        )

        call_id = None
        for _ in range(60):
            pull = client.get(
                f"/v1/sessions/s-ops/pull?cursor=0&run_id={run_id}",
                headers=_auth(),
            ).json()
            for ev in pull["events"]:
                if ev["type"] == "tool_call" and ev["payload"].get("awaiting_host"):
                    call_id = ev["payload"]["call_id"]
                    assert ev["payload"].get("requires_lease") is True
                    assert ev["payload"].get("lease")
            if call_id:
                break
            time.sleep(0.02)
        assert call_id

        client.post(
            "/v1/tool_result",
            headers=_auth(),
            json={
                "session_id": "s-ops",
                "run_id": run_id,
                "call_id": call_id,
                "ok": True,
                "stdout": "",
                "exit_code": 0,
            },
        )

        done = False
        for _ in range(80):
            pull = client.get(
                f"/v1/sessions/s-ops/pull?cursor=0&run_id={run_id}",
                headers=_auth(),
            ).json()
            if pull["status"] == "completed":
                assert any(ev["type"] == "conclusion" for ev in pull["events"])
                done = True
                break
            time.sleep(0.02)
        assert done

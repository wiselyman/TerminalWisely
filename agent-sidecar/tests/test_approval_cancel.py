"""Approval interrupt, cancel, harness, memory, audit."""

from __future__ import annotations

import time
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.agent import loop as loop_mod
from app.harness.backup import backup_commands, validate_commands_for_path
from app.harness.network_guard import build_timed_rollback_plan, is_network_dangerous
from app.main import app
from app.memory.store import find_cases, save_verified_case
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


def test_approval_then_terminal(monkeypatch: pytest.MonkeyPatch) -> None:
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
                            "arguments": '{"command":"systemctl restart nginx"}',
                        },
                    }
                ],
            },
            {
                "role": "assistant",
                "content": "nginx restarted; verify with status next.",
                "tool_calls": [],
            },
        ]
    )
    _patch_model(monkeypatch, model)

    with TestClient(app) as client:
        r = client.post(
            "/v1/chat/start",
            headers=_auth(),
            json={"session_id": "s-appr", "message": "restart nginx", "security_mode": "safe"},
        )
        assert r.status_code == 200
        run_id = r.json()["run_id"]

        approval_id = None
        for _ in range(50):
            pull = client.get(
                f"/v1/sessions/s-appr/pull?cursor=0&run_id={run_id}",
                headers=_auth(),
            ).json()
            for ev in pull["events"]:
                if ev["type"] == "approval_needed":
                    approval_id = ev["payload"]["approval_id"]
            if approval_id or pull["status"] in ("completed", "failed"):
                break
            time.sleep(0.02)
        assert approval_id

        dec = client.post(
            "/v1/approval_decision",
            headers=_auth(),
            json={
                "session_id": "s-appr",
                "run_id": run_id,
                "approval_id": approval_id,
                "approved": True,
            },
        )
        assert dec.status_code == 200, dec.text

        call_id = None
        for _ in range(50):
            pull = client.get(
                f"/v1/sessions/s-appr/pull?cursor=0&run_id={run_id}",
                headers=_auth(),
            ).json()
            for ev in pull["events"]:
                if ev["type"] == "tool_call" and ev["payload"].get("awaiting_host"):
                    call_id = ev["payload"]["call_id"]
            if call_id:
                break
            time.sleep(0.02)
        assert call_id

        tr = client.post(
            "/v1/tool_result",
            headers=_auth(),
            json={
                "session_id": "s-appr",
                "run_id": run_id,
                "call_id": call_id,
                "ok": True,
                "stdout": "",
                "exit_code": 0,
            },
        )
        assert tr.status_code == 200

        done = False
        for _ in range(80):
            pull = client.get(
                f"/v1/sessions/s-appr/pull?cursor=0&run_id={run_id}",
                headers=_auth(),
            ).json()
            if pull["status"] == "completed":
                done = True
                break
            time.sleep(0.02)
        assert done


def test_cancel_run(monkeypatch: pytest.MonkeyPatch) -> None:
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
                            "arguments": '{"command":"uname -a"}',
                        },
                    }
                ],
            }
        ]
    )
    _patch_model(monkeypatch, model)

    with TestClient(app) as client:
        r = client.post(
            "/v1/chat/start",
            headers=_auth(),
            json={"session_id": "s-stop", "message": "uname"},
        )
        run_id = r.json()["run_id"]
        call_id = None
        for _ in range(50):
            pull = client.get(
                f"/v1/sessions/s-stop/pull?cursor=0&run_id={run_id}",
                headers=_auth(),
            ).json()
            for ev in pull["events"]:
                if ev["type"] == "tool_call" and ev["payload"].get("awaiting_host"):
                    call_id = ev["payload"]["call_id"]
            if call_id:
                break
            time.sleep(0.02)
        assert call_id

        c = client.post(
            f"/v1/runs/{run_id}/cancel",
            headers=_auth(),
            json={"session_id": "s-stop", "run_id": run_id},
        )
        assert c.status_code == 200
        assert c.json()["status"] == "cancelled"


def test_network_guard_helpers() -> None:
    assert is_network_dangerous("iptables -P INPUT DROP")
    plan = build_timed_rollback_plan("iptables -P INPUT ACCEPT", rollback_delay_s=60)
    assert "snapshot" in plan
    assert "schedule_rollback" in plan
    assert backup_commands("/etc/nginx/nginx.conf")
    assert "nginx -t" in validate_commands_for_path("/etc/nginx/nginx.conf")


def test_network_guard_skips_firewall_inspect() -> None:
    probes = [
        "which ufw iptables firewalld nft 2>/dev/null",
        "dpkg -l | grep -E 'ufw|iptables|firewalld|nftables' 2>/dev/null",
        "systemctl is-active ufw firewalld 2>/dev/null",
        (
            "which ufw iptables firewalld nft 2>/dev/null; "
            "dpkg -l | grep -E 'ufw|iptables|firewalld|nftables' 2>/dev/null; "
            "systemctl is-active ufw firewalld 2>/dev/null"
        ),
        "iptables -L -n",
        "iptables -S",
        "ufw status verbose",
        "nft list ruleset",
        "firewall-cmd --state",
        "firewall-cmd --list-all",
        "nmcli device status",
        "cat /etc/ssh/sshd_config",
        "systemctl status sshd",
    ]
    for cmd in probes:
        assert not is_network_dangerous(cmd), cmd


def test_network_guard_flags_firewall_mutations() -> None:
    mutations = [
        "iptables -P INPUT DROP",
        "iptables -A INPUT -j DROP",
        "iptables -F",
        "ufw enable",
        "ufw deny 22",
        "nft flush ruleset",
        "firewall-cmd --add-port=80/tcp --permanent",
        "firewall-cmd --reload",
        "ip route del default",
        "nmcli networking off",
        "systemctl restart sshd",
        "sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config",
        "echo x > /etc/ssh/sshd_config",
    ]
    for cmd in mutations:
        assert is_network_dangerous(cmd), cmd


def test_memory_and_audit(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    from app.state import AuditLog

    STORE._audit = AuditLog()
    rid = save_verified_case(
        {
            "problem_signature": "port 8888 occupied",
            "root_cause": "python",
            "fix": "kill",
            "verification": "ss",
            "confidence": 0.8,
        }
    )
    assert rid > 0
    assert find_cases("8888")
    STORE.audit("test_evt", {"x": 1})
    STORE.audit("test_evt2", {"y": 2})
    v = STORE.verify_audit_chain()
    assert v["ok"] is True
    assert v["entries"] >= 2


def test_audit_verify_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    with TestClient(app) as client:
        STORE.audit("ping", {"ok": True})
        r = client.get("/v1/audit/verify", headers=_auth())
        assert r.status_code == 200
        assert r.json()["ok"] is True

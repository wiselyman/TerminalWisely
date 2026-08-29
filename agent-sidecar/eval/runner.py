"""Run eval scenarios against mock backends."""

from __future__ import annotations

import asyncio
import contextlib
import json
import time
from typing import Any

import httpx
from httpx import ASGITransport

from app.agent.loop import AgentLoop, deliver_approval_decision, deliver_tool_result
from app.broker import CommandBroker
from app.llm.gateway import ModelGateway
from app.models.approval import TargetSessionIdentity
from app.research.provider import ResearchProvider
from app.state import AgentRun, RunStatus
from eval.loader import EvalScenario, load_eval_scenarios
from eval.scorer import EvalResult, score_run
from mock_ollama.server import DEFAULT_MODEL, create_app

KUBECONFIG = "/home/ubuntu/.kube/config"
NS = "demo"


class FakeLinuxModel:
    """Scripted Linux tool calls for eval without SSH."""

    def __init__(self, scenario_id: str) -> None:
        self.scenario_id = scenario_id
        self.calls = 0

    async def chat_completions(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        **_: Any,
    ) -> dict[str, Any]:
        self.calls += 1
        if self.calls == 1:
            if self.scenario_id == "linux_service_status":
                return _tool_response(
                    "call_svc",
                    "service_status",
                    {"unit": "nginx", "intent": "Check nginx status"},
                )
            if self.scenario_id == "linux_list_ports":
                return _tool_response(
                    "call_ports",
                    "list_listeners",
                    {"intent": "List listening ports"},
                )
            if self.scenario_id == "linux_web_then_answer":
                return _tool_response(
                    "call_web",
                    "web_search",
                    {"query": "nginx default config path", "max_results": 3},
                )
        if self.scenario_id == "linux_service_status":
            return _text_response("nginx is active (running).")
        if self.scenario_id == "linux_list_ports":
            return _text_response("Ports in LISTEN state include :22 and :80.")
        if self.scenario_id == "linux_web_then_answer":
            return _text_response(
                "Default nginx config is typically /etc/nginx/nginx.conf."
            )
        return _text_response("done")


def _tool_response(call_id: str, name: str, args: dict[str, Any]) -> dict[str, Any]:
    return {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {
                            "id": call_id,
                            "type": "function",
                            "function": {
                                "name": name,
                                "arguments": json.dumps(args, ensure_ascii=False),
                            },
                        }
                    ],
                }
            }
        ]
    }


def _text_response(text: str) -> dict[str, Any]:
    return {
        "choices": [{"message": {"role": "assistant", "content": text}}]
    }


def _kubectl_json(*args: str) -> tuple[bool, str, str]:
    import subprocess

    cmd = ["kubectl", "--kubeconfig", KUBECONFIG, *args]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False, "", "kubectl unavailable"
    return p.returncode == 0, p.stdout, p.stderr


def _run_k8s_tool(name: str, args: dict[str, Any]) -> dict[str, Any]:
    ns = str(args.get("namespace") or NS)
    try:
        if name == "k8s_list":
            cat = str(args.get("category") or "pods")
            kind_map = {
                "pods": "pods",
                "deployments": "deploy",
                "events": "events",
            }
            kind = kind_map.get(cat, cat)
            ok, out, err = _kubectl_json("get", kind, "-n", ns, "-o", "json")
            if not ok:
                return {"ok": False, "stdout": out, "stderr": err, "exit_code": 1, "_untrusted": True}
            items = json.loads(out).get("items", [])
            rows = [
                {
                    "name": (it.get("metadata") or {}).get("name"),
                    "status": (it.get("status") or {}).get("phase"),
                }
                for it in items[:20]
            ]
            return {
                "ok": True,
                "stdout": json.dumps(rows, ensure_ascii=False),
                "stderr": "",
                "exit_code": 0,
                "_untrusted": True,
            }
        if name in {"k8s_get", "k8s_describe"}:
            kind = str(args.get("kind") or "pod")
            pod = str(args.get("name") or "")
            verb = "describe" if name == "k8s_describe" else "get"
            extra = [] if verb == "describe" else ["-o", "yaml"]
            ok, out, err = _kubectl_json(verb, kind, pod, "-n", ns, *extra)
            return {
                "ok": ok,
                "stdout": out,
                "stderr": err,
                "exit_code": 0 if ok else 1,
                "_untrusted": True,
            }
        if name == "k8s_scale":
            kind = str(args.get("kind") or "deployment").lower()
            n = str(args.get("name") or "")
            replicas = int(args.get("replicas") or 1)
            ok, out, err = _kubectl_json(
                "scale", kind, n, f"--replicas={replicas}", "-n", ns
            )
            return {
                "ok": ok,
                "stdout": out or f"scaled to {replicas}",
                "stderr": err,
                "exit_code": 0 if ok else 1,
                "_untrusted": True,
            }
        return {"ok": False, "error": f"unsupported: {name}", "_untrusted": True}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "_untrusted": True}


async def _mock_k8s_gateway() -> ModelGateway:
    app = create_app()
    transport = ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://test")
    return ModelGateway(
        base_url="http://test/v1",
        api_key="mock",
        model=DEFAULT_MODEL,
        timeout=30.0,
        client=client,
    )


async def _run_scenario(scenario: EvalScenario) -> EvalResult:
    started = time.perf_counter()
    gateway: Any = None
    if scenario.engineer_mode == "k8s":
        gateway = await _mock_k8s_gateway()
        model: Any = gateway
    else:
        model = FakeLinuxModel(scenario.id)

    metadata: dict[str, Any] = {"engineer_mode": scenario.engineer_mode}
    if scenario.engineer_mode == "k8s":
        metadata.update(
            {
                "cluster_id": "eval",
                "cluster_name": "k3s-local",
                "cluster_target": {
                    "id": "eval",
                    "kind": "kubeconfig",
                    "display_name": "k3s-local",
                },
            }
        )

    run = AgentRun(
        session_id=f"eval:{scenario.engineer_mode}",
        run_id=f"eval_{scenario.id}",
        security_mode="yolo",
        identity=TargetSessionIdentity(session_id=f"eval:{scenario.engineer_mode}"),
        metadata=metadata,
        persist_session=False,
    )
    research = ResearchProvider()
    if scenario.engineer_mode == "linux" and scenario.id == "linux_web_then_answer":

        async def _fake_web_search(query: str, max_results: int = 5) -> list[dict[str, str]]:
            return [{"title": "nginx docs", "url": "https://example.com", "snippet": "nginx.conf"}]

        research.web_search = _fake_web_search  # type: ignore[method-assign]

    loop = AgentLoop(
        run,
        model=model,
        broker=CommandBroker(),
        research=research,
        max_tool_calls=12,
        max_run_seconds=int(scenario.max_seconds),
    )

    async def host_feeder() -> None:
        while True:
            if run.status in {RunStatus.COMPLETED, RunStatus.CANCELLED, RunStatus.FAILED}:
                return
            if run.status == RunStatus.WAITING_APPROVAL and run.pending_approval:
                pa = run.pending_approval
                deliver_approval_decision(run, pa.approval_id, {"approved": True})
            elif run.status == RunStatus.WAITING_TOOL and run.pending_tool:
                pt = run.pending_tool
                args: dict[str, Any] = {}
                for ev in reversed(run.events):
                    if ev.type == "tool_call" and ev.payload.get("call_id") == pt.call_id:
                        args = dict(ev.payload.get("arguments") or {})
                        break
                if scenario.engineer_mode == "k8s":
                    result = _run_k8s_tool(pt.tool_name, args)
                elif pt.tool_name == "service_status":
                    result = {
                        "ok": True,
                        "stdout": json.dumps({"ActiveState": "active", "unit": "nginx"}),
                        "stderr": "",
                        "exit_code": 0,
                        "_untrusted": True,
                    }
                elif pt.tool_name == "list_listeners":
                    result = {
                        "ok": True,
                        "stdout": "tcp LISTEN 0.0.0.0:22\n tcp LISTEN 0.0.0.0:80",
                        "stderr": "",
                        "exit_code": 0,
                        "_untrusted": True,
                    }
                else:
                    result = {"ok": True, "stdout": "ok", "_untrusted": True}
                deliver_tool_result(run, pt.call_id, result)
            await asyncio.sleep(0.02)

    feeder = asyncio.create_task(host_feeder())
    try:
        await loop.run_until_pause_or_done(scenario.prompt)
        deadline = time.monotonic() + scenario.max_seconds
        while time.monotonic() < deadline:
            if run.status in {RunStatus.COMPLETED, RunStatus.CANCELLED, RunStatus.FAILED}:
                break
            await asyncio.sleep(0.05)
    finally:
        feeder.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await feeder
        if gateway is not None:
            await gateway.aclose()

    duration_ms = (time.perf_counter() - started) * 1000
    return score_run(run, scenario, duration_ms=duration_ms)


async def run_eval_suite(
    scenarios: list[EvalScenario] | None = None,
) -> list[EvalResult]:
    items = scenarios if scenarios is not None else load_eval_scenarios()
    results: list[EvalResult] = []
    for scenario in items:
        results.append(await _run_scenario(scenario))
    return results

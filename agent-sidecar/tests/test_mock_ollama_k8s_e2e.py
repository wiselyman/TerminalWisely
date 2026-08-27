"""E2E: Mock Ollama HTTP + AgentLoop + simulated k8s host bridge."""

from __future__ import annotations

import asyncio
import contextlib
import json
import subprocess
from typing import Any

import httpx
import pytest
from httpx import ASGITransport

from app.agent.loop import AgentLoop, deliver_approval_decision, deliver_tool_result
from app.broker import CommandBroker
from app.llm.gateway import ModelGateway
from app.models.approval import TargetSessionIdentity
from app.state import AgentRun, RunStatus
from mock_ollama.server import DEFAULT_MODEL, create_app

KUBECONFIG = "/home/ubuntu/.kube/config"
NS = "demo"


def kubectl_json(*args: str) -> tuple[bool, str, str]:
    cmd = ["kubectl", "--kubeconfig", KUBECONFIG, *args]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False, "", "kubectl unavailable"
    return p.returncode == 0, p.stdout, p.stderr


def run_k8s_tool(name: str, args: dict[str, Any]) -> dict[str, Any]:
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
            ok, out, err = kubectl_json("get", kind, "-n", ns, "-o", "json")
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
            ok, out, err = kubectl_json(verb, kind, pod, "-n", ns, *extra)
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
            ok, out, err = kubectl_json(
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


@pytest.fixture
async def mock_gateway():
    app = create_app()
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        gateway = ModelGateway(
            base_url="http://test/v1",
            api_key="mock",
            model=DEFAULT_MODEL,
            timeout=30.0,
            client=client,
        )
        yield gateway
        await gateway.aclose()


@pytest.mark.asyncio
async def test_mock_ollama_http_models_and_chat(mock_gateway: ModelGateway) -> None:
    models = await mock_gateway.list_models()
    assert DEFAULT_MODEL in models
    completion = await mock_gateway.chat_completions(
        [{"role": "user", "content": "列出 demo 命名空间 pods"}],
        tools=[
            {
                "type": "function",
                "function": {
                    "name": "k8s_list",
                    "parameters": {"type": "object", "properties": {}},
                },
            }
        ],
    )
    message = ModelGateway.extract_assistant_message(completion)
    assert message.get("tool_calls")
    assert message["tool_calls"][0]["function"]["name"] == "k8s_list"


@pytest.mark.asyncio
async def test_mock_ollama_stream_returns_tool_call(mock_gateway: ModelGateway) -> None:
    events: list[dict[str, Any]] = []
    async for ev in mock_gateway.chat_completions_stream(
        [{"role": "user", "content": "demo pods 状态"}],
        tools=[
            {
                "type": "function",
                "function": {
                    "name": "k8s_list",
                    "parameters": {"type": "object", "properties": {}},
                },
            }
        ],
    ):
        events.append(ev)
    assert any(e.get("type") == "tool_call_delta" for e in events)


async def _run_k8s_prompt(
    gateway: ModelGateway,
    prompt: str,
    *,
    required_tool: str | None = None,
) -> AgentRun:
    run = AgentRun(
        session_id="k8s:mock-e2e",
        run_id="mock_e2e",
        security_mode="yolo",
        identity=TargetSessionIdentity(session_id="k8s:mock-e2e"),
        metadata={
            "engineer_mode": "k8s",
            "cluster_id": "mock-e2e",
            "cluster_name": "k3s-local",
            "cluster_target": {
                "id": "mock-e2e",
                "kind": "kubeconfig",
                "display_name": "k3s-local",
            },
        },
        persist_session=False,
    )
    loop = AgentLoop(
        run,
        model=gateway,
        broker=CommandBroker(),
        max_tool_calls=12,
        max_run_seconds=60,
    )

    async def host_feeder() -> None:
        while True:
            if run.status in {RunStatus.COMPLETED, RunStatus.CANCELLED, RunStatus.FAILED}:
                return
            if run.status == RunStatus.WAITING_APPROVAL and run.pending_approval:
                pa = run.pending_approval
                deliver_approval_decision(
                    run,
                    pa.approval_id,
                    {"approved": True},
                )
            elif run.status == RunStatus.WAITING_TOOL and run.pending_tool:
                pt = run.pending_tool
                args: dict[str, Any] = {}
                for ev in reversed(run.events):
                    if ev.type == "tool_call" and ev.payload.get("call_id") == pt.call_id:
                        args = dict(ev.payload.get("arguments") or {})
                        break
                result = run_k8s_tool(pt.tool_name, args)
                deliver_tool_result(run, pt.call_id, result)
            await asyncio.sleep(0.02)

    feeder = asyncio.create_task(host_feeder())
    try:
        await loop.run_until_pause_or_done(prompt)
        for _ in range(600):
            if run.status in {RunStatus.COMPLETED, RunStatus.CANCELLED, RunStatus.FAILED}:
                break
            if run.status in {RunStatus.WAITING_TOOL, RunStatus.WAITING_APPROVAL}:
                await asyncio.sleep(0.05)
                continue
            await asyncio.sleep(0.05)
    finally:
        feeder.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await feeder
    if required_tool:
        tools = [e.payload.get("name") for e in run.events if e.type == "tool_call"]
        assert required_tool in tools
    return run


@pytest.mark.asyncio
async def test_mock_ollama_k8s_list_e2e(mock_gateway: ModelGateway) -> None:
    run = await _run_k8s_prompt(
        mock_gateway,
        "看看 demo 命名空间里的 Pod 都正常吗？",
        required_tool="k8s_list",
    )
    assert run.status == RunStatus.COMPLETED
    assistants = [
        str(m.get("content") or "")
        for m in run.messages
        if m.get("role") == "assistant"
    ]
    assert any("broken-pull" in t or "Running" in t for t in assistants)


@pytest.mark.asyncio
async def test_mock_ollama_k8s_diagnose_e2e(mock_gateway: ModelGateway) -> None:
    run = await _run_k8s_prompt(
        mock_gateway,
        "demo 里 broken-pull 这个 Pod 为啥起不来？",
        required_tool="k8s_describe",
    )
    assert run.status == RunStatus.COMPLETED
    text = "\n".join(
        str(m.get("content") or "")
        for m in run.messages
        if m.get("role") == "assistant"
    )
    assert "ImagePullBackOff" in text


@pytest.mark.asyncio
async def test_mock_ollama_k8s_scale_e2e(mock_gateway: ModelGateway) -> None:
    kubectl_json("scale", "deploy", "web", "--replicas=3", "-n", NS)
    run = await _run_k8s_prompt(
        mock_gateway,
        "把 demo 里的 web 扩到 4 个副本",
        required_tool="k8s_scale",
    )
    assert run.status == RunStatus.COMPLETED
    ok, out, _ = kubectl_json("get", "deploy", "web", "-n", NS, "-o", "json")
    if ok:
        replicas = int((json.loads(out).get("spec") or {}).get("replicas") or 0)
        assert replicas == 4
        kubectl_json("scale", "deploy", "web", "--replicas=3", "-n", NS)

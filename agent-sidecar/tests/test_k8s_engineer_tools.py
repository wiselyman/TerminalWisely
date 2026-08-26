"""K8s engineer mode tool surface and policy synthesis."""

from __future__ import annotations

from app.k8s import synthesize_kubectl_policy_command
from app.tools.schema import K8S_TOOLS, openai_tools


def test_k8s_tools_exclude_terminal_exec() -> None:
    names = {(t.get("function") or {}).get("name") for t in openai_tools(engineer_mode="k8s")}
    assert "terminal_exec" not in names
    assert K8S_TOOLS.issubset(names)
    assert "ask_user" in names
    assert "web_search" in names


def test_linux_tools_exclude_k8s() -> None:
    names = {(t.get("function") or {}).get("name") for t in openai_tools(engineer_mode="linux")}
    assert "terminal_exec" in names
    assert not (K8S_TOOLS & names)


def test_synthesize_kubectl_policy_commands() -> None:
    assert "kubectl apply" in synthesize_kubectl_policy_command("k8s_apply", {})
    assert "kubectl delete pod nginx -n default" == synthesize_kubectl_policy_command(
        "k8s_delete", {"kind": "pod", "name": "nginx"}
    )
    assert "kubectl get pods -A" == synthesize_kubectl_policy_command(
        "k8s_list", {"category": "pods", "all_namespaces": True}
    )

"""K8s engineer mode tool surface and policy synthesis."""

from __future__ import annotations

from app.k8s import synthesize_kubectl_policy_command
from app.tools.schema import K8S_TOOLS, openai_tools


def test_k8s_tools_exclude_terminal_exec() -> None:
    names = {(t.get("function") or {}).get("name") for t in openai_tools(engineer_mode="k8s")}
    assert "terminal_exec" not in names
    assert "submit_ops_plan" not in names
    assert K8S_TOOLS.issubset(names)
    assert "ask_user" in names
    assert "web_search" in names
    assert "spawn_investigator" in names


def test_linux_tools_exclude_k8s() -> None:
    names = {(t.get("function") or {}).get("name") for t in openai_tools(engineer_mode="linux")}
    assert "terminal_exec" in names
    assert "submit_ops_plan" in names
    assert not (K8S_TOOLS & names)


def test_k8s_investigator_tools_are_readonly() -> None:
    from app.tools.schema import investigator_tools

    names = {
        (t.get("function") or {}).get("name")
        for t in investigator_tools(engineer_mode="k8s")
    }
    assert "k8s_list" in names
    assert "k8s_get" in names
    assert "k8s_logs" in names
    assert "k8s_apply" not in names
    assert "k8s_delete" not in names
    assert "k8s_scale" not in names
    assert "terminal_exec" not in names


def test_k8s_system_prompt_skips_linux_skills() -> None:
    from app.agent.prompts import build_system_prompt

    prompt = build_system_prompt(
        engineer_mode="k8s",
        cluster_id="c1",
        cluster_name="demo",
        security_mode="safe",
    )
    assert "k8s_list" in prompt
    assert "Do NOT use terminal_exec" in prompt
    # Linux skill catalog must not be injected for k8s mode.
    assert "Available skills" not in prompt


def test_nudge_for_engineer_mode() -> None:
    from app.harness.verify import VERIFY_NUDGE, VERIFY_NUDGE_K8S, nudge_for_engineer_mode

    assert nudge_for_engineer_mode("verify", "linux") == VERIFY_NUDGE
    assert nudge_for_engineer_mode("verify", "k8s") == VERIFY_NUDGE_K8S
    assert "k8s_get" in nudge_for_engineer_mode("verify", "k8s")


def test_synthesize_kubectl_policy_commands() -> None:
    assert "kubectl apply" in synthesize_kubectl_policy_command("k8s_apply", {})
    assert "kubectl delete pod nginx -n default" == synthesize_kubectl_policy_command(
        "k8s_delete", {"kind": "pod", "name": "nginx"}
    )
    assert "kubectl get pods -A" == synthesize_kubectl_policy_command(
        "k8s_list", {"category": "pods", "all_namespaces": True}
    )

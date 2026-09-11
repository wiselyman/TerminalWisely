"""Agent Status Bar — ephemeral tail injection for model samples."""

from __future__ import annotations

from app.agent.status_bar import (
    build_status_bar,
    messages_with_status_bar,
    status_bar_for_run,
)
from app.state import AgentRun


def test_status_bar_contains_goal_and_constraints() -> None:
    msgs = [{"role": "user", "content": "Check nginx and fix if down"}]
    text = build_status_bar(
        messages=msgs,
        security_mode="safe",
        engineer_mode="linux",
        memory_scope="u@h:22",
        last_mutation_risk="R2",
        verify_nudged=False,
        active_plan=[{"step": "probe", "status": "done"}, {"step": "fix"}],
        injected_skills=["nginx-restart"],
    )
    assert text.startswith("[AGENT_STATUS]")
    assert "Goal:" in text
    assert "nginx" in text.lower()
    assert "Plan:" in text
    assert "Skills injected: nginx-restart" in text
    assert "security=safe" in text
    assert "verify_pending" in text
    assert "host_scope=u@h:22" in text


def test_status_bar_repeat_command_alert() -> None:
    tc = {
        "id": "c1",
        "type": "function",
        "function": {
            "name": "terminal_exec",
            "arguments": '{"command":"systemctl status nginx"}',
        },
    }
    msgs = [
        {"role": "user", "content": "fix nginx"},
        {"role": "assistant", "content": "", "tool_calls": [tc]},
        {"role": "assistant", "content": "", "tool_calls": [{**tc, "id": "c2"}]},
        {"role": "assistant", "content": "", "tool_calls": [{**tc, "id": "c3"}]},
    ]
    text = build_status_bar(messages=msgs)
    assert "Alert:" in text
    assert "repeated 3" in text


def test_messages_with_status_bar_appends_at_end_not_system_merge() -> None:
    base = [
        {"role": "system", "content": "static system"},
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
    ]
    status = build_status_bar(messages=base)
    out = messages_with_status_bar(base, status)
    assert out[-1]["role"] == "user"
    assert out[-1]["content"].startswith("[AGENT_STATUS]")
    assert out[0]["content"] == "static system"
    # Prior status bars stripped
    again = messages_with_status_bar(out, status)
    assert sum(1 for m in again if "[AGENT_STATUS]" in str(m.get("content") or "")) == 1


def test_status_bar_for_run_reads_metadata() -> None:
    run = AgentRun(session_id="s", run_id="r1", security_mode="observe")
    run.metadata["engineer_mode"] = "k8s"
    run.metadata["memory_scope"] = "cluster-a"
    run.metadata["injected_skills"] = ["k8s-debug"]
    run.metadata["active_plan"] = [{"step": "list pods"}]
    run.append_message({"role": "user", "content": "why is the pod crashlooping?"})
    text = status_bar_for_run(run)
    assert "mode=k8s" in text
    assert "k8s-debug" in text
    assert "crashloop" in text.lower() or "pod" in text.lower()


def test_status_bar_not_persisted_in_run_messages() -> None:
    """Status is sample-only; SessionLog must not grow status bars."""
    run = AgentRun(session_id="s", run_id="r2", security_mode="safe")
    run.append_message({"role": "user", "content": "uptime"})
    before = len(run.messages)
    _ = status_bar_for_run(run)
    assert len(run.messages) == before
    assert not any(
        "[AGENT_STATUS]" in str(m.get("content") or "") for m in run.messages
    )

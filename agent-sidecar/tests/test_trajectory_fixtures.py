"""Light trajectory regression fixtures (approval / status / isolation)."""

from __future__ import annotations

from pathlib import Path

from app.agent.status_bar import messages_with_status_bar, status_bar_for_run
from app.llm.context import compact_messages_for_model
from app.state import AgentRun, RunStatus
from app.subagent.investigator import can_spawn_investigator


def test_fixture_status_bar_at_sample_tail() -> None:
    """Model sample order: history… then AGENT_STATUS last."""
    run = AgentRun(session_id="fx", run_id="fx1", security_mode="safe")
    run.metadata["injected_skills"] = ["demo-skill"]
    run.append_message({"role": "system", "content": "STATIC"})
    run.append_message({"role": "user", "content": "approve nothing yet"})
    run.append_message({"role": "assistant", "content": "ok"})
    base = compact_messages_for_model(
        run.messages, max_context_tokens=50_000, tools_overhead_tokens=0
    )
    sample = messages_with_status_bar(base, status_bar_for_run(run))
    assert sample[-1]["content"].startswith("[AGENT_STATUS]")
    assert "demo-skill" in sample[-1]["content"]
    # Not merged into first system
    assert "[AGENT_STATUS]" not in str(sample[0].get("content") or "")


def test_fixture_pending_approval_flag_in_status() -> None:
    run = AgentRun(session_id="fx", run_id="fx2", security_mode="safe")
    run.append_message({"role": "user", "content": "rm -rf /tmp/x"})
    run.status = RunStatus.WAITING_APPROVAL

    class _FakePending:
        pass

    run.pending_approval = _FakePending()  # type: ignore[assignment]
    text = status_bar_for_run(run)
    assert "waiting_approval" in text


def test_fixture_investigator_isolation_flag(tmp_path: Path) -> None:
    parent = AgentRun(session_id="fx", run_id="parent", security_mode="safe")
    parent.append_message({"role": "user", "content": "secret parent context XYZ123"})
    parent.append_message({"role": "assistant", "content": "parent reply"})
    assert can_spawn_investigator(parent)
    # Child would be created empty — parent transcript must stay on parent only
    assert any("XYZ123" in str(m.get("content") or "") for m in parent.messages)

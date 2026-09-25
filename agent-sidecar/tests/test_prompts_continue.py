"""Prompt regression: continue unfinished work + multi-topic chat rules."""

from __future__ import annotations

from app.agent.prompts import SYSTEM_PROMPT, SYSTEM_PROMPT_K8S
from app.harness.verify import CONCLUDE_NUDGE


def test_prompts_continue_uses_sessionlog_evidence() -> None:
    for text in (SYSTEM_PROMPT, SYSTEM_PROMPT_K8S):
        assert "SessionLog tool" in text or "authoritative evidence" in text
        assert "latest user message is the task" in text.lower()


def test_prompts_multi_topic_referable_prior_and_single_goal_reply() -> None:
    for text in (SYSTEM_PROMPT, SYSTEM_PROMPT_K8S):
        assert "available context" in text
        assert "refers to earlier" in text
        assert "second summary" in text.lower() or "second summary/checklist" in text


def test_prompts_now_means_today_not_invented_year() -> None:
    for text in (SYSTEM_PROMPT, SYSTEM_PROMPT_K8S):
        assert "Today (UTC)" in text
        assert "append a calendar year" in text.lower()


def test_conclude_nudge_targets_latest_goal_only() -> None:
    lower = CONCLUDE_NUDGE.lower()
    assert "latest user goal" in lower
    assert "second summary" in lower or "checklist" in lower
    assert "[HARNESS]" in CONCLUDE_NUDGE

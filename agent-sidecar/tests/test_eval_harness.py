"""Eval harness loader and scoring."""

from __future__ import annotations

import pytest

from eval.loader import load_eval_scenarios
from eval.report import format_report, format_text_summary
from eval.runner import run_eval_suite
from eval.scorer import EvalResult, score_run, summarize_results
from app.models.approval import TargetSessionIdentity
from app.state import AgentRun, RunStatus


def test_load_eval_scenarios_count() -> None:
    scenarios = load_eval_scenarios()
    assert len(scenarios) >= 8
    ids = {s.id for s in scenarios}
    assert "k8s_list_pods" in ids
    assert "linux_service_status" in ids


def test_score_run_pass_and_fail() -> None:
    from eval.loader import EvalScenario

    run = AgentRun(
        session_id="s",
        run_id="r",
        status=RunStatus.COMPLETED,
        identity=TargetSessionIdentity(session_id="s"),
        persist_session=False,
    )
    run.append_message({"role": "assistant", "content": "nginx is active"})
    run.append_event("tool_call", {"name": "service_status"})
    scenario = EvalScenario(
        id="x",
        engineer_mode="linux",
        prompt="nginx?",
        required_tools=["service_status"],
        content_contains=["nginx"],
    )
    ok = score_run(run, scenario, duration_ms=10)
    assert ok.passed

    bad = EvalScenario(
        id="y",
        engineer_mode="linux",
        prompt="?",
        required_tools=["terminal_exec"],
        content_contains=["missing"],
    )
    fail = score_run(run, bad, duration_ms=10)
    assert not fail.passed
    assert fail.failures


def test_summarize_results() -> None:
    summary = summarize_results(
        [
            EvalResult("a", True, 1.0),
            EvalResult("b", False, 2.0, failures=["x"]),
        ]
    )
    assert summary["total"] == 2
    assert summary["passed"] == 1


@pytest.mark.asyncio
async def test_run_eval_suite_smoke() -> None:
    scenarios = load_eval_scenarios()
    subset = [s for s in scenarios if s.id in {"linux_web_then_answer", "k8s_list_pods"}]
    results = await run_eval_suite(subset)
    assert len(results) == 2
    report = format_report(results)
    assert "summary" in report
    assert format_text_summary(results)


@pytest.mark.asyncio
async def test_full_eval_suite() -> None:
    results = await run_eval_suite()
    failed = [r for r in results if not r.passed]
    assert not failed, format_text_summary(results)

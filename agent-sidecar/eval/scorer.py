"""Score an AgentRun against an eval scenario."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.state import AgentRun, RunStatus

from eval.loader import EvalScenario


@dataclass
class EvalResult:
    scenario_id: str
    passed: bool
    duration_ms: float
    tools_called: list[str] = field(default_factory=list)
    failures: list[str] = field(default_factory=list)
    status: str = ""
    tags: list[str] = field(default_factory=list)


def _assistant_text(run: AgentRun) -> str:
    parts: list[str] = []
    for msg in run.messages:
        if msg.get("role") != "assistant":
            continue
        content = msg.get("content")
        if isinstance(content, str) and content.strip():
            parts.append(content)
    for ev in run.events:
        if ev.type == "assistant_message":
            text = str((ev.payload or {}).get("content") or "")
            if text.strip():
                parts.append(text)
        if ev.type == "assistant_delta":
            text = str((ev.payload or {}).get("text") or "")
            if text.strip():
                parts.append(text)
    return "\n".join(parts)


def score_run(
    run: AgentRun,
    scenario: EvalScenario,
    *,
    duration_ms: float,
) -> EvalResult:
    tools = [
        str((ev.payload or {}).get("name") or "")
        for ev in run.events
        if ev.type == "tool_call"
    ]
    tools = [t for t in tools if t]
    failures: list[str] = []

    if run.status != RunStatus.COMPLETED:
        failures.append(f"expected status completed, got {run.status.value}")

    if scenario.required_tools:
        if scenario.tools_in_order:
            idx = 0
            for name in tools:
                if idx < len(scenario.required_tools) and name == scenario.required_tools[idx]:
                    idx += 1
            if idx < len(scenario.required_tools):
                missing = scenario.required_tools[idx:]
                failures.append(f"missing ordered tools: {missing}")
        else:
            missing = [t for t in scenario.required_tools if t not in tools]
            if missing:
                failures.append(f"missing tools: {missing}")

    text = _assistant_text(run)
    for needle in scenario.content_contains:
        if needle not in text:
            failures.append(f"assistant text missing: {needle!r}")

    return EvalResult(
        scenario_id=scenario.id,
        passed=not failures,
        duration_ms=duration_ms,
        tools_called=tools,
        failures=failures,
        status=run.status.value,
        tags=list(scenario.tags),
    )


def summarize_results(results: list[EvalResult]) -> dict[str, Any]:
    passed = sum(1 for r in results if r.passed)
    total = len(results)
    return {
        "total": total,
        "passed": passed,
        "failed": total - passed,
        "pass_rate": round(passed / total, 4) if total else 0.0,
        "avg_duration_ms": round(
            sum(r.duration_ms for r in results) / total, 2
        )
        if total
        else 0.0,
    }

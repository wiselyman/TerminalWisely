"""JSON/text eval reports for CI."""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from eval.scorer import EvalResult, summarize_results


def format_report(results: list[EvalResult]) -> dict[str, Any]:
    summary = summarize_results(results)
    return {
        "summary": summary,
        "results": [asdict(r) for r in results],
    }


def write_report(results: list[EvalResult], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(format_report(results), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def format_text_summary(results: list[EvalResult]) -> str:
    summary = summarize_results(results)
    lines = [
        f"Eval: {summary['passed']}/{summary['total']} passed "
        f"({summary['pass_rate'] * 100:.1f}%) "
        f"avg {summary['avg_duration_ms']:.0f}ms",
    ]
    for r in results:
        mark = "PASS" if r.passed else "FAIL"
        lines.append(
            f"  [{mark}] {r.scenario_id} ({r.duration_ms:.0f}ms) "
            f"tools={r.tools_called}"
        )
        for f in r.failures:
            lines.append(f"         - {f}")
    return "\n".join(lines)

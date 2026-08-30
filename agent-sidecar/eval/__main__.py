"""CLI: python -m eval [--report path.json]"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from eval.loader import load_eval_scenarios
from eval.report import format_text_summary, write_report
from eval.runner import run_eval_suite


def main() -> None:
    parser = argparse.ArgumentParser(description="Run ops eval harness")
    parser.add_argument(
        "--scenarios",
        type=Path,
        default=None,
        help="YAML scenario file",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=None,
        help="Write JSON report to this path",
    )
    parser.add_argument(
        "--fail-fast",
        action="store_true",
        help="Exit non-zero on first failure",
    )
    args = parser.parse_args()
    scenarios = load_eval_scenarios(args.scenarios)
    results = asyncio.run(run_eval_suite(scenarios))
    print(format_text_summary(results))
    if args.report:
        write_report(results, args.report)
        print(f"Report written to {args.report}")
    failed = [r for r in results if not r.passed]
    if args.fail_fast and failed:
        sys.exit(1)
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()

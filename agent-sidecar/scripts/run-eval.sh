#!/usr/bin/env bash
# Run ops eval harness and write JSON report for CI.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="${TW_AI_VENV:-$ROOT/.venv}"
PY="${VENV}/bin/python"
if [[ ! -x "$PY" ]]; then
  PY=python3
fi
REPORT="${1:-/tmp/ops_eval_report.json}"
export PYTHONPATH="${ROOT}${PYTHONPATH:+:$PYTHONPATH}"
exec "$PY" -m eval --report "$REPORT"

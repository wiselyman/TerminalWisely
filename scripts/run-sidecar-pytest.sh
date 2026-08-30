#!/usr/bin/env bash
# Run agent-sidecar pytest on Unix (Linux/macOS). Windows CI uses a separate step.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/agent-sidecar"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
. .venv/bin/activate
python -m pip install -q -U pip
python -m pip install -q -r requirements.txt
PYTHONPATH=. python -m pytest tests/ -q --tb=line "$@"

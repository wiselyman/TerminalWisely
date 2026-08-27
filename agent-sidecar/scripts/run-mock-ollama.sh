#!/usr/bin/env bash
# Start scripted mock Ollama (default :11435) for K8s Engineer chat regression.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="${TW_AI_VENV:-$HOME/.local/share/com.wangyunfei.terminalwisely/ai-engineer/venv}"
PY="${VENV}/bin/python"
if [[ ! -x "$PY" ]]; then
  PY=python3
fi
export PYTHONPATH="${ROOT}${PYTHONPATH:+:$PYTHONPATH}"
exec "$PY" -m mock_ollama "$@"

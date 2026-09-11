#!/usr/bin/env bash
# Release live E2E gate for AI Linux Engineer sidecar.
# Requires a running sidecar on TW_AI_SIDECAR_URL (default http://127.0.0.1:8765)
# and model credentials (TW_AI_API_KEY / profile env expected by the sidecar).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export TW_AI_LIVE_E2E=1
export TW_AI_SIDECAR_URL="${TW_AI_SIDECAR_URL:-http://127.0.0.1:8765}"
export TW_AI_TOKEN="${TW_AI_TOKEN:-dev-token}"

if [[ -z "${TW_AI_API_KEY:-}" ]]; then
  echo "TW_AI_API_KEY is required for the live gate" >&2
  exit 2
fi

echo "== health =="
curl -fsS "${TW_AI_SIDECAR_URL}/health" >/dev/null

echo "== live pytest gate =="
if command -v uv >/dev/null 2>&1; then
  uv run pytest tests/test_live_e2e_optional.py -q --tb=short
else
  PYTHONPATH=. python3 -m pytest tests/test_live_e2e_optional.py -q --tb=short
fi

echo "LIVE E2E GATE PASSED"

#!/usr/bin/env bash
# Playwright browser E2E: Vite preview + real agent-sidecar (no manual steps).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SIDECAR_PORT="${E2E_SIDECAR_PORT:-8765}"
PREVIEW_PORT="${E2E_PREVIEW_PORT:-1420}"
export TW_AI_TOKEN="${TW_AI_TOKEN:-dev-token}"
export TW_AI_E2E=1
export E2E_BASE_URL="http://127.0.0.1:${PREVIEW_PORT}"

cleanup() {
  [[ -n "${SIDECAR_PID:-}" ]] && kill "$SIDECAR_PID" 2>/dev/null || true
  [[ -n "${PREVIEW_PID:-}" ]] && kill "$PREVIEW_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "=== Sidecar venv ==="
cd agent-sidecar
if [[ ! -d .venv ]]; then python3 -m venv .venv; fi
# shellcheck disable=SC1091
. .venv/bin/activate
python -m pip install -q -U pip
python -m pip install -q -r requirements.txt

echo "=== Start sidecar :${SIDECAR_PORT} ==="
pkill -f "uvicorn app.main:app.*--port ${SIDECAR_PORT}" 2>/dev/null || true
sleep 1
TW_AI_TOKEN="$TW_AI_TOKEN" TW_AI_E2E=1 PYTHONPATH=. \
  uvicorn app.main:app --host 127.0.0.1 --port "$SIDECAR_PORT" >>/tmp/e2e-sidecar.log 2>&1 &
SIDECAR_PID=$!
cd "$ROOT"

for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${SIDECAR_PORT}/healthz" >/dev/null; then
    break
  fi
  sleep 0.5
done
curl -sf "http://127.0.0.1:${SIDECAR_PORT}/healthz" >/dev/null || {
  echo "Sidecar failed to start" >&2
  tail -30 /tmp/e2e-sidecar.log >&2 || true
  exit 1
}

echo "=== Build E2E frontend ==="
VITE_E2E=1 \
VITE_E2E_SIDECAR_URL="http://127.0.0.1:${SIDECAR_PORT}" \
VITE_E2E_SIDECAR_TOKEN="$TW_AI_TOKEN" \
npm run build

echo "=== Vite preview :${PREVIEW_PORT} ==="
pkill -f "vite preview.*${PREVIEW_PORT}" 2>/dev/null || true
sleep 1
npx vite preview --host 127.0.0.1 --port "$PREVIEW_PORT" >>/tmp/e2e-preview.log 2>&1 &
PREVIEW_PID=$!
for _ in $(seq 1 30); do
  if curl -sf "${E2E_BASE_URL}/" >/dev/null; then break; fi
  sleep 0.5
done
curl -sf "${E2E_BASE_URL}/" >/dev/null || {
  echo "Vite preview failed" >&2
  tail -20 /tmp/e2e-preview.log >&2 || true
  exit 1
}

echo "=== Playwright ==="
npx playwright test --config playwright.config.ts
echo "Playwright E2E passed."

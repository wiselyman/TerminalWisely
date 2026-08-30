#!/usr/bin/env bash
# Run the full automated test suite for TerminalWisely.
# Usage: ./scripts/run-all-tests.sh [--skip-eval] [--skip-rust]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_EVAL=0
SKIP_RUST=0
for arg in "$@"; do
  case "$arg" in
    --skip-eval) SKIP_EVAL=1 ;;
    --skip-rust) SKIP_RUST=1 ;;
    -h|--help)
      echo "Usage: $0 [--skip-eval] [--skip-rust]"
      exit 0
      ;;
  esac
done

section() {
  echo ""
  echo "========================================"
  echo "  $1"
  echo "========================================"
}

FAIL=0

run_step() {
  local name="$1"
  shift
  if "$@"; then
    echo "✓ $name"
  else
    echo "✗ $name"
    FAIL=1
  fi
}

section "1/9 Frontend static smoke (功能 wiring)"
run_step "smoke-product-checklist" node scripts/smoke-product-checklist.mjs

section "2/9 Frontend unit tests (Vitest)"
run_step "vitest" npm test -- --run

section "3/9 Frontend typecheck + build"
run_step "tsc + vite build" npm run build

if [[ "$SKIP_RUST" -eq 0 ]]; then
  section "4/8 Rust unit tests (cargo test)"
  run_step "cargo test" bash -c "cd src-tauri && cargo test --quiet"

  section "5/9 Cross-arch Rust check (macOS / Windows hosts only)"
  run_step "cross-arch-rust-check" bash scripts/cross-arch-rust-check.sh
else
  echo "⊘ Skipped Rust tests (--skip-rust)"
fi

section "6/8 Agent sidecar pytest (单元 + 集成 + E2E)"
run_step "pytest" bash scripts/run-sidecar-pytest.sh

if [[ "$SKIP_EVAL" -eq 0 ]]; then
  section "7/9 Ops eval harness (功能测试 8/8)"
  EVAL_REPORT="${TMPDIR:-/tmp}/ops_eval_report.json"
  run_step "eval harness" bash -c "
    cd agent-sidecar
    . .venv/bin/activate
    PYTHONPATH=. python -m eval --report '$EVAL_REPORT'
    python - <<'PY'
import json, sys
from pathlib import Path
p = Path('$EVAL_REPORT')
data = json.loads(p.read_text())
s = data['summary']
assert s['passed'] == s['total'], s
assert s['failed'] == 0
print(f\"Eval: {s['passed']}/{s['total']} passed\")
PY
  "
else
  echo "⊘ Skipped eval harness (--skip-eval)"
fi

section "8/9 Playwright UI E2E (Platform / Eval / MCP)"
if [[ "${SKIP_E2E:-0}" -eq 0 ]]; then
  run_step "playwright e2e" bash scripts/e2e-playwright.sh
else
  echo "⊘ Skipped Playwright E2E (--skip-e2e or SKIP_E2E=1)"
fi

section "9/9 Summary"
if [[ "$FAIL" -eq 0 ]]; then
  echo ""
  echo "All automated tests PASSED."
  echo "Optional native desktop smoke: npm run test:e2e:desktop (requires DISPLAY)"
  exit 0
else
  echo ""
  echo "Some automated tests FAILED — see output above."
  exit 1
fi

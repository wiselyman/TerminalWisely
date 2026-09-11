#!/usr/bin/env bash
# Run the full automated test suite for TerminalWisely.
# Usage: ./scripts/run-all-tests.sh [--skip-rust] [--skip-live]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_RUST=0
SKIP_LIVE=0
for arg in "$@"; do
  case "$arg" in
    --skip-eval)
      # Legacy flag (eval harness removed with Platform feature).
      ;;
    --skip-rust) SKIP_RUST=1 ;;
    --skip-live) SKIP_LIVE=1 ;;
    -h|--help)
      echo "Usage: $0 [--skip-rust] [--skip-live]"
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

section "1/10 Frontend static smoke (功能 wiring)"
run_step "smoke-product-checklist" node scripts/smoke-product-checklist.mjs

section "2/10 Frontend unit tests (Vitest)"
run_step "vitest" npm test -- --run

section "3/10 Frontend typecheck + build"
run_step "tsc + vite build" npm run build

if [[ "$SKIP_RUST" -eq 0 ]]; then
  section "4/10 Rust unit tests (cargo test)"
  run_step "cargo test" bash -c "cd src-tauri && cargo test --quiet"

  if [[ "$SKIP_LIVE" -eq 0 ]]; then
    section "5/10 SSH live integration (Docker openssh)"
    run_step "ssh-live-integration" bash scripts/e2e-ssh-integration.sh

    section "6/10 K8s live integration (k3d)"
    run_step "k8s-live-integration" bash scripts/e2e-k8s-integration.sh
  else
    echo "⊘ Skipped live integration (--skip-live)"
  fi

  section "7/10 Cross-arch Rust check (macOS / Windows hosts only)"
  run_step "cross-arch-rust-check" bash scripts/cross-arch-rust-check.sh
else
  echo "⊘ Skipped Rust tests (--skip-rust)"
fi

section "8/10 Agent sidecar pytest (单元 + 集成 + E2E)"
run_step "pytest" bash scripts/run-sidecar-pytest.sh

section "9/10 Playwright UI E2E (full product surface)"
if [[ "${SKIP_E2E:-0}" -eq 0 ]]; then
  run_step "playwright e2e" bash scripts/e2e-playwright.sh
else
  echo "⊘ Skipped Playwright E2E (--skip-e2e or SKIP_E2E=1)"
fi

section "10/10 Summary"
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

#!/usr/bin/env bash
# Live K8s integration against k3d cluster (kubectl + Rust k8s module).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export TW_K8S_E2E=1
export TW_K8S_E2E_NAMESPACE="${TW_K8S_E2E_NAMESPACE:-default}"
export TW_K8S_E2E_POD="${TW_K8S_E2E_POD:-tw-e2e-nginx}"

cleanup() {
  bash scripts/e2e-k8s-fixture.sh stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

set +e
bash scripts/e2e-k8s-fixture.sh start
fixture_rc=$?
set -e

if [[ "$fixture_rc" -eq 77 ]]; then
  echo "⊘ Skipped K8s live integration (docker/k3d unavailable)"
  exit 0
fi
if [[ "$fixture_rc" -ne 0 ]]; then
  exit "$fixture_rc"
fi

export KUBECONFIG="${TW_K8S_E2E_KUBECONFIG:-${TMPDIR:-/tmp}/tw-e2e-k3s.kubeconfig}"
export TW_K8S_E2E_CONTEXT="$(kubectl config current-context)"

echo "=== Rust K8s live integration ==="
cd src-tauri
cargo test --features integration-tests k8s::live_integration -- --nocapture
rc=$?
cd "$ROOT"

if [[ "$rc" -ne 0 ]]; then
  echo "✗ K8s live integration failed" >&2
  exit "$rc"
fi

echo "✓ K8s live integration passed"

#!/usr/bin/env bash
# Live SSH connect + SFTP upload against Docker openssh-server.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export TW_SSH_E2E=1
export TW_SSH_E2E_HOST="${TW_SSH_E2E_HOST:-127.0.0.1}"
export TW_SSH_E2E_PORT="${TW_SSH_E2E_PORT:-2222}"
export TW_SSH_E2E_USER="${TW_SSH_E2E_USER:-e2e}"
export TW_SSH_E2E_PASSWORD="${TW_SSH_E2E_PASSWORD:-e2etest}"
export TW_SSH_E2E_PRIVATE_KEY="${TW_SSH_E2E_PRIVATE_KEY:-${TMPDIR:-/tmp}/tw-e2e-ssh-keys/id_ed25519}"

cleanup() {
  bash scripts/e2e-ssh-fixture.sh stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

set +e
bash scripts/e2e-ssh-fixture.sh start
fixture_rc=$?
set -e

if [[ "$fixture_rc" -eq 77 ]]; then
  echo "⊘ Skipped SSH live integration (docker unavailable)"
  exit 0
fi
if [[ "$fixture_rc" -ne 0 ]]; then
  exit "$fixture_rc"
fi

echo "=== Rust SSH/SFTP live integration ==="
cd src-tauri
cargo test --features integration-tests live_integration -- --nocapture
rc=$?
cd "$ROOT"

if [[ "$rc" -ne 0 ]]; then
  echo "✗ SSH live integration failed" >&2
  exit "$rc"
fi

echo "✓ SSH live integration passed"

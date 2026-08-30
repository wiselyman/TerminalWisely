#!/usr/bin/env bash
# Cross-target `cargo check` where the host toolchain can compile without a full OS sysroot.
# Linux GTK/Tauri targets are validated on native linux-x86_64 and linux-aarch64 CI runners.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/src-tauri"

OS="$(uname -s)"
ARCH="$(uname -m)"

declare -a TARGETS=()

case "${OS}-${ARCH}" in
  Darwin-arm64|Darwin-aarch64|Darwin-x86_64)
    TARGETS=(aarch64-apple-darwin x86_64-apple-darwin)
    ;;
  MINGW*|MSYS*|CYGWIN*|Windows_NT*)
    TARGETS=(x86_64-pc-windows-msvc aarch64-pc-windows-msvc)
    ;;
  Linux-*)
    echo "cross-arch-rust-check: Linux uses native runners per CPU arch (see CI matrix) — skipping cross-compile"
    exit 0
    ;;
  *)
    echo "cross-arch-rust-check: unsupported host ${OS}/${ARCH} — skipping" >&2
    exit 0
    ;;
esac

echo "=== Cross-arch cargo check (${OS}/${ARCH}) ==="
for triple in "${TARGETS[@]}"; do
  echo "→ cargo check --target ${triple}"
  rustup target add "${triple}" >/dev/null 2>&1 || true
  cargo check --quiet --target "${triple}"
done
echo "cross-arch-rust-check: OK (${#TARGETS[@]} targets)"

#!/usr/bin/env bash
# Fetch astral python-build-standalone (install_only) into agent-sidecar/runtime.
# Usage: scripts/fetch-embedded-python.sh [target-triple]
# Examples:
#   scripts/fetch-embedded-python.sh aarch64-apple-darwin
#   scripts/fetch-embedded-python.sh x86_64-unknown-linux-gnu
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${ROOT}/agent-sidecar/runtime"
TAG="${PYTHON_STANDALONE_TAG:-20260807}"
PY_VER="${PYTHON_STANDALONE_VERSION:-3.12.13}"

TARGET="${1:-}"
if [[ -z "${TARGET}" ]]; then
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) TARGET="aarch64-apple-darwin" ;;
    Darwin-x86_64) TARGET="x86_64-apple-darwin" ;;
    Linux-x86_64) TARGET="x86_64-unknown-linux-gnu" ;;
    Linux-aarch64|Linux-arm64) TARGET="aarch64-unknown-linux-gnu" ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT*)
      if [[ "$(uname -m)" == "aarch64" || "$(uname -m)" == "arm64" ]]; then
        TARGET="aarch64-pc-windows-msvc"
      else
        TARGET="x86_64-pc-windows-msvc"
      fi
      ;;
    *)
      echo "Cannot detect target; pass triple explicitly" >&2
      exit 1
      ;;
  esac
fi

# Map Rust/tauri triples → python-build-standalone names
case "${TARGET}" in
  aarch64-apple-darwin) PLATFORM="aarch64-apple-darwin" ;;
  x86_64-apple-darwin) PLATFORM="x86_64-apple-darwin" ;;
  aarch64-unknown-linux-gnu|linux-aarch64) PLATFORM="aarch64-unknown-linux-gnu" ;;
  x86_64-unknown-linux-gnu|linux-x86_64|"") PLATFORM="x86_64-unknown-linux-gnu" ;;
  aarch64-pc-windows-msvc|windows-aarch64) PLATFORM="aarch64-pc-windows-msvc" ;;
  x86_64-pc-windows-msvc|windows-x86_64) PLATFORM="x86_64-pc-windows-msvc" ;;
  *) PLATFORM="${TARGET}" ;;
esac

EXT="tar.gz"
if [[ "${PLATFORM}" == *windows* ]]; then
  EXT="tar.gz"
fi

FILE="cpython-${PY_VER}+${TAG}-${PLATFORM}-install_only.${EXT}"
URL="https://github.com/astral-sh/python-build-standalone/releases/download/${TAG}/${FILE}"

echo "Fetching embedded Python: ${URL}"
TMP="$(mktemp -d)"
cleanup() { rm -rf "${TMP}"; }
trap cleanup EXIT

curl -fsSL "${URL}" -o "${TMP}/python.${EXT}"
# Keep directory but clear previous extract (preserve .gitkeep / .gitignore if present)
mkdir -p "${DEST}"
find "${DEST}" -mindepth 1 -maxdepth 1 ! -name '.gitkeep' ! -name '.gitignore' -exec rm -rf {} +
tar -xzf "${TMP}/python.${EXT}" -C "${TMP}"
# install_only layout: top-level `python/` directory
if [[ -d "${TMP}/python" ]]; then
  shopt -s dotglob nullglob
  mv "${TMP}/python/"* "${DEST}/"
  shopt -u dotglob nullglob
else
  echo "Unexpected archive layout" >&2
  ls -la "${TMP}" >&2
  exit 1
fi

PY_BIN=""
if [[ -f "${DEST}/bin/python3" ]]; then
  PY_BIN="${DEST}/bin/python3"
elif [[ -f "${DEST}/bin/python" ]]; then
  PY_BIN="${DEST}/bin/python"
elif [[ -f "${DEST}/python.exe" ]]; then
  PY_BIN="${DEST}/python.exe"
elif [[ -f "${DEST}/python3.exe" ]]; then
  PY_BIN="${DEST}/python3.exe"
fi

if [[ -z "${PY_BIN}" ]]; then
  echo "python binary missing under ${DEST}" >&2
  find "${DEST}" -maxdepth 3 -type f | head -50 >&2
  exit 1
fi

# Cross-target packs (e.g. aarch64 python.exe on x64 Windows runner) cannot execute.
# Existence is enough for bundling; version print is best-effort.
if "${PY_BIN}" -V 2>/dev/null; then
  :
else
  echo "Embedded Python present at ${PY_BIN} (not runnable on this host; OK for cross-arch bundle)"
fi

echo "Embedded Python ready at ${DEST}"

# App-managed kubectl & Helm (option B)

**Date:** 2026-08-26  
**Status:** approved — implement

## Goal

Install **latest stable** `kubectl` and `helm` into the app data directory on demand; prefer those binaries for **local** kubeconfig operations. SSH jump hosts unchanged.

## Layout

- `{data_local_dir}/TerminalWisely/bin/kubectl` (+ `.exe` on Windows)
- `{data_local_dir}/TerminalWisely/bin/helm`
- `{data_local_dir}/TerminalWisely/bin/tools.json` — versions / installed_at

## Resolution

Local exec: app `bin/` if file exists → else PATH name.

## Download

- kubectl: `https://dl.k8s.io/release/stable.txt` then platform binary (+ `.sha256` verify)
- helm: GitHub `helm/helm` latest release tag → `https://get.helm.sh/helm-{tag}-{os}-{arch}.tar.gz` (zip on Windows)

## Commands

- `k8s_tools_status`
- `k8s_tools_install` (`kubectl` | `helm` | `all`)

## UI

Workbench error / tools strip: install + update-to-latest buttons; drop “not bundled” copy.

## Out of scope

Package bundling; remote SSH install; pinned / user-typed versions.

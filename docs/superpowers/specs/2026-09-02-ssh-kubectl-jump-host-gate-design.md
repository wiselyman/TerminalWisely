# SSH kubectl jump-host gate (connect-on-open)

**Date:** 2026-09-02  
**Status:** approved (UX revised: confirm dialog)  
**Choice:** Ask user to confirm, then connect like Hosts “open”

## Problem

Opening an `ssh_kubectl` cluster without a live SSH session must not silently auto-connect or leave Workbench stuck on “加载中…”.

## Behavior

1. On `selectCluster` for `kind === ssh_kubectl` with **no live SSH tab**:
   - Open cluster tab / select it, but **do not** fetch summary/resources.
   - Set `jumpHostGate.status = confirm` (or `missing_bookmark` if no saved host).
   - Show a **Modal**: explain jump host is required; buttons **连接** / **取消**.
2. **连接** → same path as Hosts open (`connectSaved` + attach session) → toast → refresh data.
   - Needs password → password modal (existing).
   - Failure → banner + retry.
3. **取消** → close this cluster tab (back to previous cluster or Home).
4. While gate is active, category switches do not kick off resource fetches.

## Out of scope

- Pre-connecting all jump hosts
- Auto-switching sidebar to Hosts

# Implementation Plan: Host Continuity Phase 4 — Approval UX

> **For agentic workers:** Use TDD; checkbox steps below.

**Goal:** Explicit Once / Session / Reject approval; target-bound session cache; identity plumbing.

**Architecture:** Keep existing `approve_for_session` API flags; change FE primary CTAs and defaults; plumb identity; call invalidate on identity change.

## Files

- Modify: `src/components/aiEngineer/AiEngineerPanel.tsx` — three primary buttons
- Modify: `src/i18n/locales/{en,zh-CN}/tools.json` — copy
- Modify: `src/lib/aiEngineer/chatClient.ts` — host_fingerprint, remote_user
- Modify: `src/stores/aiEngineerStore.ts` — resolveApproval helpers if needed
- Modify: `agent-sidecar/app/main.py` — invalidate on identity change at chat start
- Modify: `e2e/ai-engineer-approval.spec.ts` + bootstrap testids
- Test: `agent-sidecar/tests/test_approval_cache.py` (extend)
- Test: new `agent-sidecar/tests/test_approval_session_semantics.py`

## Tasks

### Task 1: Session cache semantics tests
### Task 2: Identity invalidate on chat/start
### Task 3: FE Once / Session / Reject + i18n
### Task 4: Plumb fingerprint/remote_user into chat start
### Task 5: E2E + TEST_MATRIX row

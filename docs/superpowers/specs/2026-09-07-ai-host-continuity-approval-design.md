# Design: Host Continuity Phase 4 — Approval Once / Session / Reject

**Date:** 2026-09-07  
**Status:** Approved for implementation (Track A)  
**Learned from:** Claude Code allow/ask/deny; OpenCode PermissionV2 once/always; Codex sandbox ≠ approval

## User-facing goal

When AI needs approval for a remote command, the user can clearly choose:

1. **Approve once** — this command runs once; ask again next time  
2. **Remember for this session** — same exact command on this target won’t re-prompt until disconnect / host change  
3. **Reject** — deny this attempt  

AskUser (clarification) remains separate and never grants mutation.

## Current gaps

- Approve + checkboxes; session-remember defaults **ON** (easy accidental broad allow)  
- “Once” only by unchecking both boxes  
- `host_fingerprint` / `remote_user` not sent on chat start → weak target binding  
- `GLOBAL_APPROVAL_CACHE.invalidate_session` never called on reconnect / identity change  
- Copy says “same binary” but cache is **exact canonical command**  
- Permanent allow already exists (advanced); keep as optional advanced control, not primary CTA

## Decisions

| Topic | Decision |
|-------|----------|
| Primary CTAs | Three buttons: Once / Remember session / Reject |
| Default | Once (no session store unless user picks Remember session) |
| Session key | Exact canonical command + `TargetSessionIdentity` fingerprint |
| Identity fields | FE must send `session_id`, `server_id`, `host_fingerprint`, `remote_user` on chat start |
| Invalidation | On chat start if identity fingerprint differs from last for this UI session; on SSH disconnect clear that bucket |
| Permanent allow | Keep checkbox under “Advanced” (non-production only); not a primary button |
| Remember read-only binaries | Keep existing checkbox (policy soft-allow for read probes); not conflated with session command cache |
| SecurityMode | Remember never raises mode; production still disables session/permanent cache |
| Rust lease | Keep one-shot exact command + session_id; identity binding enforced in sidecar cache |

## Data flow

```
approval_needed → UI [Once | Session | Reject]
  Once    → approved=true, approve_for_session=false, approve_permanently=false
  Session → approved=true, approve_for_session=true
  Reject  → approved=false
→ POST /v1/approval_decision → PrivilegeLease (always one-shot)
→ if Session: GLOBAL_APPROVAL_CACHE.store(identity, command)
```

On subsequent identical command: `_try_session_approval` hits cache → skip UI, still PolicyEngine + new lease.

## Acceptance

- Unit: once does not store cache; session stores and second lookup hits; reject does not store  
- Unit: identity fingerprint change → previous bucket not used; invalidate_session clears  
- FE: three primary buttons; session default off; i18n says exact command  
- chat/start includes host_fingerprint + remote_user when available  
- `check-no-agent-hardcoding.mjs` PASS; update TEST_MATRIX

## Non-goals

- Target-keyed permanent disk allow (still global overrides; document as known limit)  
- External CLI agents (Track B)  
- Changing PolicyEngine risk table semantics

# Design: Host Continuity Phase 2 — Durable compaction

**Date:** 2026-09-07  
**Learned from:** OpenCode session compaction checkpoints

## User goal

Long chats keep verified conclusions after context pressure.

## Decisions

| Topic | Decision |
|-------|----------|
| Engine | Extend existing `CompactionEngine` (do not replace) |
| Events | Keep start/summary/end; add `durable=true` on end payload |
| Evidence | Prefer retaining tail events that contain verify / exit_code / harness nudge markers when selecting compactable range |
| Overflow | Keep single overflow retry in AgentLoop |
| Summary prompt | Already preserves verified conclusions — keep |

## Acceptance

Unit: compact emits end with durable flag; retain preference keeps verify-tagged surface nodes when possible.

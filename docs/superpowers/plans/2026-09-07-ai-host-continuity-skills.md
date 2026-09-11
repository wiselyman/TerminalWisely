# Implementation Plan: Host Continuity Phase 3 — Skills curator

**Goal:** Usage tracking + archive stale user skills; match inject on user turns.

Delivered in-tree:

- Spec: `docs/superpowers/specs/2026-09-07-ai-host-continuity-skills-design.md`
- `app/skills/curator.py`, loader/match updates
- Loop injects `skill_injection_block` on user messages
- Tests: `tests/test_skill_curator.py`

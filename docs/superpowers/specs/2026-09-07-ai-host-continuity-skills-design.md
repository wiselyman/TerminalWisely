# Design: Host Continuity Phase 3 — Skill curator

**Date:** 2026-09-07  
**Learned from:** Hermes skills + curator

## User goal

Reusable playbooks without permission grants; archive stale agent/user skills.

## Decisions

| Topic | Decision |
|-------|----------|
| Bundled skills | Under `agent-sidecar/skills/` — never auto-archive |
| User/agent skills | Under data dir `skills/user/` and `skills/archive/` |
| Usage | Record match/inject hits in `skills/usage.json` |
| Curator | Archive user skills unused for N days (default 30) or never used after create+grace |
| Manual distill | User triggers「提炼为 Skill」→ model calls `skill_save` → `skills/user/<id>/SKILL.md` |
| Guidance only | Existing prompt tags; curator cannot touch Policy |

## Non-goals

Per-app capabilities.yaml entries; software name blacklists.

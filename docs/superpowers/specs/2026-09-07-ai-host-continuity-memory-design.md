# Design: Host Continuity Phase 1 — Host-scoped memory

**Date:** 2026-09-07  
**Learned from:** OpenClaw USER.md / MEMORY.md / daily notes

## User goal

Same host across chats: fewer repeated questions about prefs and confirmed host facts.

## Decisions

| Topic | Decision |
|-------|----------|
| Scope key | Prefer `server_id`; fallback `session_id` |
| Storage | Local JSON under sidecar data dir (`memory/hosts/<safe_key>.json`) |
| User (cross-host) | `memory/user.json` — prefs/notes only; inject before host block |
| Layers | Host: `prefs` / `facts` / `notes`. User: `prefs` / `notes` |
| Injection | Budget-capped blocks **appended before each user turn** (not baked into static system); tagged UNTRUSTED DATA. Keeps system+history prefix cacheable. |
| Authority | Memory never grants Policy / approval |
| Mutation | Tools `host_memory_get` / `host_memory_put`; `user_memory_get` / `user_memory_put` |
| Clear | `clear_*` helpers (host clear tool still deferred) |

## Non-goals

Mem0/MemoryLake SaaS; auto-dreaming consolidation (later).

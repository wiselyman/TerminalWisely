# Design: Multi-topic chat (Cursor-local parity)

**Date:** 2026-09-25  
**Status:** Approved for implementation  
**Plan:** `.cursor/plans/multi-topic_cursor_parity_9277db06.plan.md`  
**Related:** `2026-09-25-continue-task-and-long-run-design.md` (SessionLog resume), `2026-09-08-agent-status-bar-design.md`

## User-facing goal

Match **Cursor local** same-thread multi-topic feel:

1. **P0 — Same-turn conclude:** After answering the latest question, do not dump a second unrelated “总结” checklist from other probes in the same turn.
2. **P1 — Cross-turn:** Freely switch to a new topic; later refer to an earlier topic and get SessionLog/summary-backed answers — without silently restarting unfinished long jobs.

Out of scope: Cursor Cloud; cross-thread auto-memory; regex stripping of “总结” headings; product-specific rules (CUDA/driver/llama).

## Decisions

| Topic | Decision |
|-------|----------|
| Approach | Generic prompt + `CONCLUDE_NUDGE` + status-bar `Prior:` — no title blacklists |
| Latest message | Still the primary task |
| Prior unfinished installs | Do not restart unless user asks to continue (unchanged) |
| Referencing prior | When user mentions or clearly refers to prior conclusions/facts, use SessionLog/summary |
| Same-turn probes | Background evidence; do not open a second summary section unless the latest ask needs them |
| Status bar | `Goal:` = latest real user message; `Prior:` = 1–2 earlier user goals (skip harness/`[HARNESS]`/`[AGENT_STATUS]`) |
| Hardcoding | No product names; hardcoding gate must PASS |

## P0 — Single-goal conclude

Update `CONCLUDE_NUDGE` in [`verify.py`](../../agent-sidecar/app/harness/verify.py) (used by probe-streak and act conclude paths):

- Answer **only** the latest user goal.
- Do not append a second summary/checklist for other this-turn tool findings unless they directly answer that goal.

Add a matching bullet under “latest user message is the task” in Linux + K8S system prompts.

## P1 — Soften prior + Prior topics

- Soften prompts: prior turns are usable when the user refers to them; keep anti-zombie long-job rule.
- `build_status_bar`: add `- Prior: …` from up to two earlier real user messages (truncated), excluding the current Goal and harness/status injections.
- Skip harness user messages when selecting Goal (so conclude nudges do not become the Goal).

## Acceptance

1. `CONCLUDE_NUDGE` asserts latest-goal / no-second-summary semantics (no CUDA strings).
2. Prompt tests for single-goal conclude + referable prior.
3. Status bar tests: Goal skips harness; Prior lists earlier user asks; budget ≤800.
4. `node scripts/check-no-agent-hardcoding.mjs` PASS.
5. `./scripts/run-all-tests.sh` PASS (fix unrelated E2E if still red).

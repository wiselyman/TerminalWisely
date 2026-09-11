# AI Harness — Ops LACS-style typed plans

Date: 2026-07-31  
Status: implemented (Approach 1 evolve-in-place)

## Problem

Ops reliability depended on the LLM calling tools and finishing installs/uninstalls.
Weak models skipped tools, timed out, or produced dishonest conclusions. Per-command
approval also caused fatigue on multi-step work.

## Goal

Harness owns mutate intents via a closed catalogue of typed `OpsStep`s (`OpsPlan`),
with one plan-envelope approval, exact command execution, fail-stop, output redaction,
and a hash-chained audit log — patterns borrowed from SysKnife/LACS, LinuxAgent,
AdminKlaus, and plan-envelope UX (NexusAdminAssistant), without embedding their daemons.

## Non-goals

- SysKnife remote privileged daemon / Ed25519 audit
- Banning all shell for diagnose
- LangGraph / OpenHands / aisuite migration

## Design

1. **OpsPlan** — `intent` + ordered `OpsStep{kind, risk, summary, command}` + `plan_hash`.
2. **Policy** — SAFE / CONFIRM / BLOCK (`allow` / `require_approval` / `deny`) + capabilities.
3. **Envelope** — medium/high steps approved once; commands run verbatim after approve.
4. **Install** — low-risk bootstrap (clone/README) auto; deps from listing/README → CONFIRM.
5. **Uninstall / service** — locate then typed plan envelope.
6. **Fail-stop** — first hard failure stops remaining steps of the *current
   approved OpsPlan snapshot*; evidence returns to the model to replan within
   budget (see `2026-07-31-model-in-loop-recovery-design.md`). Does **not**
   end the agent run by itself.
7. **Audit** — `prev_hash` / `entry_hash`; `GET /v1/audit/verify`.

## Invariants

- Mutate success must not depend on which model profile is selected.
- Approve binds `plan_hash`; harness must not LLM-rewrite approved commands.
- Clone ≠ install complete; missing deps → honest incomplete conclusion.

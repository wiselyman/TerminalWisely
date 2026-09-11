# Design: Agent Status Bar (context distillation)

**Date:** 2026-09-08  
**Source:** AI Agents in Depth §2.6  
**Status:** implementing

## Goal

Distill scattered trajectory state into an explicit block placed at the **end of the
messages sent to the model** each sample — not into the static system prefix.

## Placement (KV-cache)

```
static system → prior history → turn_context (date/skills/memory) → user → skill body
→ … tools …
→ [AGENT_STATUS]   ← ephemeral, last message of the sample request only
```

- Do **not** persist the status bar into SessionLog (avoids polluting replay + cache).
- Rebuild every model sample from live run state.

## Fields

| Field | Source |
|-------|--------|
| Goal | Latest user message (truncated) |
| Plan | `metadata.active_plan` if present |
| Tools | Counts by name from surface tool_calls; repeat-command warning |
| Skills | `metadata.injected_skills` this turn |
| Constraints | security_mode, pending approval/sudo flags, last_mutation_risk + verify_nudged |
| Scope | memory_scope / engineer_mode (facts only) |

Budget: ≤ ~800 chars.

## Non-goals

Inventing host metrics; writing status into permanent system prompt.

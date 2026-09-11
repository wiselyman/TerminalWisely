# Investigator sticky bar (option B)

Date: 2026-08-25  
Status: approved  
Scope: AI Engineer panel — make depth-1 investigator visible like `activePlan`.

## Goal

When the parent agent calls `spawn_investigator`, show a sticky bar in the AI chat: question, running/done/failed, and a short summary preview. Nested host commands stay on existing terminal tool cards (`investigator: true` already on bridged `tool_call`).

## Context

Sidecar already emits:

- `investigator_start` — `{ child_run_id, question, focus }`
- `investigator_end` — `{ child_run_id, ok, status, summary_preview }`

FE currently ignores these. No new SSH path; PolicyEngine + Broker unchanged.

## Decisions

| Topic | Choice |
|-------|--------|
| Placement | Top of message list, sibling to plan bar (sticky within chat scroll) |
| State | `activeInvestigation` on `aiEngineerStore` (mirror `activePlan`) |
| Start | Map `investigator_start` → `{ status: "running", question, focus?, childRunId }` |
| End | Map `investigator_end` → `{ status: ok ? "done" : "failed", summaryPreview? }` |
| Clear | Clear on new user send / thread switch / stop; keep finished bar until next send |
| Nested tools | Unchanged — terminal cards in transcript; optional `investigator` badge later (non-goal now) |
| i18n | `aiEngineer.investigatorTitle` + running/done/failed labels (en + zh-CN) |

## UI (minimal)

```
┌ Investigator · Running
│ <question truncated>
└ (when done) summary_preview truncated ~2 lines
```

Style: reuse plan-bar tokens (border, title weight); distinct accent (e.g. info blue) so it is not confused with Plan.

## Non-goals

- Nested tool timeline / tree  
- Separate investigator chat thread  
- Persisting `activeInvestigation` across app restarts  
- Changing investigator tools or depth rules  

## Tests

- Unit/protocol: assert `investigator_start` / `investigator_end` still emitted (`test_investigator.py` already covers spawn; extend if needed for event types).  
- FE: map events into store (manual / existing panel patterns; no new E2E required for merge).

## Success

User can see that an investigator is running and what it concluded without reading raw tool JSON.

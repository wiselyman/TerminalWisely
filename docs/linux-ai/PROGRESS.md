# PROGRESS — AI Linux Engineer

## Status legend

- DONE — tests + evidence attached
- IN_PROGRESS
- BLOCKED — failure documented

## Phase 0–10 — DONE

See prior sections historically; suite evidence below.

### Hard gates 1–3 — DONE
- `tests/test_e2e_hard_gates.py` (terminal + ask_user)
- `tests/test_gate2_web.py`

### Policy / Approval / Lease — DONE
- Mode-aware R0–R4 (`tests/test_policy.py`)
- **Capability policy engine (2026-08-09):** argv + `agent-sidecar/policy/*.yaml` + optional `{data_dir}/policy/overrides.yaml`; unknown binaries strict (approval). Spec: `docs/superpowers/specs/2026-08-09-capability-policy-engine-design.md`
- Approval interrupt (`tests/test_approval_cancel.py`)
- **Rust PrivilegeLease hard-gate**: `ai_register_privilege_lease` + exact command consume in `ai_terminal_exec` (`cargo test ai_engineer::leases`)
- FE registers lease before host exec

### Network timed rollback — DONE
- Approval wraps dangerous network cmds via `compose_network_safe_script` (snapshot → schedule → apply → verify → cancel)
- Lease binds to wrapped `exec_command`

### Production dual-approval — DONE
- `security_mode=production` → `dual_confirm` + type exact command (`confirm_text`)

### OpsPlan + conclusion — DONE
- Tool `submit_ops_plan` + envelope approval + fail-stop remaining steps
- `conclusion` / `UNKNOWN_OUTCOME` on cancel-during-mutation (`tests/test_ops_network_conclusion.py`)

### LangGraph macro — DONE
- `start_run_via_graph` wraps AgentLoop with MemorySaver (`thread_id=run_id`)

### STOP / cancel / audit / memory / skills — DONE
- Prior phase evidence + cancel API

## Suite evidence

```
cd agent-sidecar && PYTHONPATH=. python3.12 -m pytest tests/ -q
→ 167 passed, 3 skipped (live optional)

cd src-tauri && cargo test ai_engineer::leases
→ 1 passed

npx tsc --noEmit → ok
cargo check → ok
```

## Phase P0 (2026-08-25) — SessionLog + ToolPipeline — DONE

Source patterns: DeepSeek Harness session surface / deriveMessages; Codex-style staged tool dispatch.

- **ToolPipeline** (`app/harness/pipeline.py`): pre → around → body → post hooks
- **tools_dispatch** (`app/agent/tools_dispatch.py`): name → handler table
- **SessionLog** (`app/session/log.py`): append-only events + surface + `derive_messages()`; `AgentRun.messages` is a projection
- **JSONL persist** (`app/session/store.py`): `{data_dir}/sessions/{session_id}/{run_id}.jsonl` when `persist_session=True`
- **RepeatToolReminder** (`app/harness/guards/repeat_tool.py`): post-hook advisory on identical consecutive tool calls (thresholds 3/5/8)

Tests: `tests/test_session_log.py`

## Phase P1 (2026-08-25) — Compaction + guards + approval cache — DONE

- **CompactionEngine** (`app/session/compaction.py`, `tool_pairing.py`): tool-pairing safe surface replace; pressure + overflow triggers
- **Token meter** (`app/llm/token_meter.py`): soft budget reminders
- **ToolTimeoutGuard** (`app/harness/guards/timeout.py`)
- **Session approval cache** (`app/harness/approval_cache.py`, `command_canonical.py`): `approve_for_session`; production/network/R4 never cached

Tests: `test_compaction.py`, `test_tool_pairing.py`, `test_token_meter.py`, `test_approval_cache.py`, `test_command_canonical.py`

## Phase P2 (partial, 2026-08-25) — update_plan + FE — DONE

- **`update_plan` tool** (`tools/schema.py`, `loop._update_plan`): UI-only checklist; emits `plan_progress`; no Broker
- **FE plan panel** + **`approve_for_session`** checkbox (non-production)
- Tests: `test_update_plan.py`

## Phase P2 (2026-08-25) — invariants + persistent allow — DONE

- **JSONL fixture replay** (`tests/fixtures/sessions/`, `test_session_replay.py`)
- **Persistent allow** (`policy/persistent_allow.py`) → `allowed_commands` in overrides; FE `approve_permanently`
- **Canonical command keys** shared with session cache

## Phase P3 (2026-08-25) — read-only tools + skills — DONE

- **Linux probe tools**: `service_status`, `list_listeners`, `grep_remote_logs`, `read_remote_file` (仍经 PolicyEngine + Broker)
- **Skills on-demand** (`skills/match.py`): tag 匹配注入 playbook 片段
- New skills: `systemd-debug`, `nginx-config`; updated `inspect-ports`
- Tests: `test_linux_probe.py`, `test_skill_match.py`, `test_persistent_allow.py`

## Phase P3b (2026-08-25) — depth-1 investigator — DONE

- **`spawn_investigator` tool**: nested `InvestigatorLoop` with `security_mode=observe`
- Host waits bridged to parent run (same SSH / FE `tool_result` path); depth max=1
- Tool subset via `investigator_tools()`; no ask_user / OpsPlan / nested spawn
- Tests: `test_investigator.py`

## Closure (2026-08-25) — product resume loop — DONE

- **Resume API**: `POST /v1/chat/start` with `resume_run_id` clones prior SessionLog into a new run; `POST /v1/chat/continue` hydrates same `run_id` from disk; `GET /v1/sessions/{id}/runs`, `GET /v1/runs/{id}/transcript`
- **FE**: `ChatThread.lastRunId` persisted; each send passes `resume_run_id` so tool-bearing context survives across turns/restarts better than text-only history
- **UI**: notice rows for `session_resumed` / `compaction`; friendly labels for `spawn_investigator` / `update_plan`
- Tests: `tests/test_session_resume.py`

## Investigator sticky bar (2026-08-25) — DONE

- FE maps `investigator_start` / `investigator_end` → `activeInvestigation` sticky bar (sibling to Plan)
- Spec: `docs/superpowers/specs/2026-08-25-investigator-sticky-bar-design.md`

## Next iteration (2026-08-25) — DIRECTION LOCKED + P0 IMPLEMENTED

Primary: **context ingest P0** + **Ask/Plan/Agent** + workflow chips.

Specs:

- `docs/superpowers/specs/2026-08-25-next-iteration-primary.md`
- `docs/superpowers/specs/2026-08-25-context-ingest-design.md`
- `docs/superpowers/specs/2026-08-25-interaction-modes-design.md`

Landed:

- Sidecar `interaction_mode` tool filter + `InteractionModeGate`; `attachments[]` on chat start/continue
- FE Ask/Plan/Agent control, attachment tray (console/remote/local), empty-state workflow chips
- Tests: `tests/test_interaction_mode.py`

Deferred by choice: MCP read-only, multi-model BYOK routing.
Still deferred: deep Office layout fidelity (Word formatting / large Excel beyond row caps).

### Thick interrupt / durable wait — DONE (2026-08-25)

LangGraph mid-node `interrupt()` deferred (would re-run whole `agent_loop`). Instead:

- Durable `{run}.wait.json` for tool / ask_user / approval waits
- Hydrate re-arms futures + background watcher; deliver endpoints hydrate+arm after restart
- Approval restart continues approved command via `resume_from_approval_wait` (not LLM-only resume)
- Tests: `tests/test_wait_resume.py`

### Office P1 text extract — DONE (2026-08-25)

- Sidecar `local_office` attachment → PDF/docx/xlsx plain text (`office_extract.py`)
- FE accepts `.pdf` / `.docx` / `.xlsx` (legacy `.doc`/`.xls` refused)
- Caps: 2 MiB bytes, 20 PDF pages, 200 spreadsheet rows
- Tests: `tests/test_office_extract.py`

## Live E2E

Release gate (not default CI):

```
cd agent-sidecar && ./scripts/live_e2e_gate.sh
# requires running sidecar + TW_AI_API_KEY + TW_AI_TOKEN
```

Optional pytest (skipped unless `TW_AI_LIVE_E2E=1`): `tests/test_live_e2e_optional.py`  
CI now runs sidecar unit tests on ubuntu/mac (skip live).

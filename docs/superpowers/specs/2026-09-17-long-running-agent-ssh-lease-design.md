# Design: Long-running Agent + SSH lease (Cursor-aligned)

**Date:** 2026-09-17  
**Status:** Approved for implementation (Approach B)  
**Plan:** `docs/superpowers/plans/2026-09-17-long-running-agent-ssh-lease.md`  
**Related:** `2026-09-07-ai-exec-idle-timeout-design.md` (amended for long jobs), host-continuity wait snapshots, AgentLoop budgets

## User-facing goal

Align TerminalWisely AI Engineer with Cursor’s long-running agent model **in one delivery**:

1. Host work (downloads, builds, training) can run for **hours**; the model **parks and wakes** on checkpoints instead of one blocked sample.
2. While any AI run is active on a terminal session, that session’s **SSH must not expire into reconnect / new TCP** — same handle only.
3. A stuck sidecar (`running` but no progress) must fail loudly and release the lease — not look “alive” forever.

Out of scope: Cursor Cloud VM (close laptop, agent on remote infra). TerminalWisely stays **Terminal-first** on the existing SSH session.

## Non-goals

- No second SSH login for AI; no PTY scraping.
- No per-app / per-model hardcoding (no vLLM/ollama/Nemotron special cases).
- No silent reconnect “to save” the session during an AI lease.
- No Cloud-Agent remote VM as the primary path.

## Current gaps

| Area | Today | Gap |
|------|--------|-----|
| SSH during AI | russh keepalive 20s×12; FE auto-reconnect ≤5 on disconnect | AI run does not freeze reconnect; user/auto reconnect can swap handle mid-run |
| AI exec idle | After any byte, **60s silence** closes exec channel (`ai-exec-idle-timeout`) | Sparse progress logs (multi-GB pulls) look “stuck” and get cut |
| Budgets | `max_run_seconds` 900 active (host waits excluded); terminal total up to 86400 | No wall-clock / stall watchdog for “running but never entered loop” |
| Park | `WAITING_TOOL` + wait snapshots + TOOL_TIMEOUT | Timeout ≠ kill remote is documented; idle channel kill still fights long sparse jobs |
| Sidecar health | Process `/health` OK while AgentLoop never advances | flash-next “no response”: `running`, empty spans, no outbound to model |

## Decisions

| Topic | Decision |
|-------|----------|
| Approach | **B — Local long-running harness** on existing session |
| SSH lease | While run ∈ `{running, waiting_tool, waiting_user, waiting_approval}`, lease holds: no FE auto-reconnect, no `reconnect_ssh` swap, keepalive hardened |
| Exec vs session | Idle/total abort **exec channel only**; TCP session kept by keepalive under lease |
| Long-job idle | If `timeout_seconds ≥ 600` (or explicit long-job flag later): **disable** `idle_after_output`; keep `first_output` fail-fast with raised cap; keep `total` wall-clock |
| Short jobs | Default still uses idle-after-output ~60s (existing design) |
| TOOL_TIMEOUT | Channel wait ended; `host_may_still_be_running`; next steps must be read-only verify — no same-target re-pull unless user asks |
| Stall watchdog | `running` + no pull-event progress + no model HTTP start for N seconds (60–120) → `failed` / STALLED, clear lease |
| Wall-clock | Configurable max wall time for a run (hours-scale); waits don’t burn model; over → failed + SessionLog retain for continue/resume |
| UI | Long-wait status (elapsed + last progress from exec chunks / heartbeat); lease-break banner asks STOP AI first |
| Hardcoding | Generic timeouts, leases, watchdog only |

## §1 SSH lease (no reconnect)

### State

- FE: `aiSessionLease` keyed by `sessionId`, set on successful `chat/start` / continue while run active; clear on terminal run status (`completed|failed|cancelled|idle`) or explicit STOP / superseded cancel.
- Optional Rust mirror: reject `reconnect_ssh_session` when lease asserted (FE is primary gate; Rust is belt).

### Behavior under lease

1. `TerminalView` `session-disconnected` auto-reconnect path: **no-op** (show banner).
2. User-triggered reconnect / `reconnect_ssh_session`: **blocked** with clear error.
3. Keepalive: tighten while leased (e.g. interval 10s, max misses enough for ~5min), `inactivity_timeout` remains `None`.
4. `ai_terminal_exec` continues to use `ssh_snapshot` → same `Arc<Handle>` only.

### On lease end

- Clear FE flag; auto-reconnect policy returns to normal.
- Do not auto-reconnect as a side effect of lease clear.

## §2 Long-job harness

### Rust `ai_exec_limits`

- Input: `timeout_seconds` (clamped 5–86400).
- If `timeout_seconds >= 600`:
  - `idle_after_output = None`
  - `first_output = min(max(45s, some raised cap), total)` (exact numbers in plan; still fail-fast for true hangs)
  - `total = timeout_seconds`
- Else: keep today’s first/idle/total behavior (idle ~60s).

### Sidecar / AgentLoop

- Existing pause of run budget during host/ask/approval waits: keep.
- On TOOL_TIMEOUT / timed_out tool result: reinforce generic “verify before retry; host may still run” (prompt + harness nudge already exist — extend tests, not product-specific rules).
- Optional `long_job_progress` / heartbeat events while `WAITING_TOOL` if no chunk traffic (UI only).

### Multi-hour loop

- Active reasoning budget (`max_run_seconds`) stays separate from wall-clock.
- Wall-clock max (env, hours-scale default): exceeded → fail with recoverable SessionLog.
- No per-task command templates.

## §3 Stall watchdog + UI

### Watchdog

- Scope: in-memory run with `status=running`.
- STALLED if for N seconds: no new pull events **and** no model request started for this run.
- Effect: mark failed, emit event, clear lease hooks; do not touch SSH reconnect.
- Distinct from process-level `ensure_sidecar` / `/health`.

### UI

- RunTrace / status: “host job in progress”, elapsed, last chunk snippet.
- Lease disconnect banner: AI holding session — STOP first.
- STOP AI: cancel run → clear lease; do not imply killing remote long jobs unless user asks.

## Data flow (happy path)

```
chat/start → set SSH lease
  → AgentLoop sample / tool_call terminal_exec(timeout_seconds large)
  → FE ai_terminal_exec (same handle; no idle kill)
  → stream chunks → UI progress
  → tool_result → continue / complete
  → clear lease
```

```
sparse multi-hour pull → no idle channel kill
  → optional TOOL_TIMEOUT at total → read-only verify on same SSH
```

```
running, no events, no model HTTP for N s → STALLED failed → clear lease
```

## Acceptance / tests

1. **Lease:** under active run, FE does not auto-reconnect; reconnect invoke rejected or no-op; keepalive still ticks.
2. **Long idle:** `timeout_seconds>=600` + sparse output beyond 60s still captures until total or exit (Rust unit / live if available).
3. **Short idle:** default path still idle-kills ~60s after last byte (regression vs `2026-09-07-ai-exec-idle-timeout`).
4. **TOOL_TIMEOUT:** payload includes host-may-still-run; loop does not require product-specific commands.
5. **STALLED:** fake run running with frozen clocks / no events → failed within N.
6. **Hardcoding gate:** `node scripts/check-no-agent-hardcoding.mjs` PASS.
7. Update `docs/TEST_MATRIX.md` row for long-running lease + watchdog.

## Implementation order (for later plan)

1. SSH lease FE + reconnect gates (+ optional Rust reject)
2. `ai_exec_limits` long-job idle disable + tests
3. Stall watchdog in sidecar + FE error surface
4. Wall-clock budget + UI long-wait chrome
5. Full `./scripts/run-all-tests.sh`

## Locked parameters (see plan)

- Keepalive (all SSH connects): 10s × 30
- Long-job threshold: `timeout_seconds >= 600` (None → default 7200 → long)
- Long-job `first_output`: 300s (capped by total)
- STALLED N: 90s (`TW_AI_STALL_SECONDS`)
- Wall-clock: 12h (`TW_AI_MAX_RUN_WALL_SECONDS`)

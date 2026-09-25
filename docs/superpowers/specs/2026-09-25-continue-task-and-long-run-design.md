# Design: Same-thread continue + Cursor-local long run

**Date:** 2026-09-25  
**Status:** Approved  
**Plan:** `docs/superpowers/plans/2026-09-25-continue-task-and-long-run.md`  
**Related:**
- [`2026-09-17-long-running-agent-ssh-lease-design.md`](./2026-09-17-long-running-agent-ssh-lease-design.md) — SSH lease, `timeout_seconds≥600` idle-off, stall watchdog (host channel)
- [`2026-09-07-ai-exec-idle-timeout-design.md`](./2026-09-07-ai-exec-idle-timeout-design.md) — short-job idle-after-output (~60s)
- [`2026-09-07-ai-host-continuity-compaction-design.md`](./2026-09-07-ai-host-continuity-compaction-design.md) — durable compaction
- [`2026-09-07-ai-host-continuity-memory-design.md`](./2026-09-07-ai-host-continuity-memory-design.md) — host/user memory (out of scope here)
- Plan: `.cursor/plans/memory_and_long_tasks_35df5e70.plan.md`

## User-facing goal

Match **Cursor local Agent** for two pain points (not Cursor Cloud):

1. **Continue unfinished work in the same chat** — after a pause, stall, STOP, or natural turn end, saying「继续 / continue / 接着做」must pick up with tool evidence, not restart as a new topic.
2. **Long host jobs while the app stays open** — large downloads / installs / builds may produce sparse stdout for a long time; do not kill the run or pretend the model stalled just because tokens stopped.

## Non-goals

| Out | Why |
|-----|-----|
| Cursor Cloud (合盖 / 断网 / 换机仍续跑) | Explicit product bar: local only |
| Cross-thread / cross-host preference memory as P0 | Separate continuity memory specs; not this pain |
| Second SSH / PTY scrape | Existing AI Linux Engineer invariants |
| Task / product hardcoding (tok/s, ollama, year-append, per-app whitelist) | AGENTS.md iron rule |
| Guaranteeing remote process survives STOP AI or app quit | Local Cursor does not either |

## Problem (honest gaps)

| Claim | Reality today |
|-------|----------------|
| FE always resumes SessionLog | [`aiEngineerStore`](../../../src/stores/aiEngineerStore.ts) passes `resumeRunId=lastRunId` when present |
| Resume failure is visible | [`chat_start`](../../../agent-sidecar/app/main.py): if `create_run_resuming` returns `None`, **silently** `create_run` + thin `history` (user/assistant text only, no tool results) |
| Prompts support continue | [`prompts.py`](../../../agent-sidecar/app/agent/prompts.py): 「latest message is the task; do not resume unfinished work unless that message asks」— correct intent, but thin history + weak continue signal → model often reopens the furnace |
| Long jobs are safe | Host wait can be long, but FE thinking-idle (5m) and sidecar `is_progress_stalled` historically treated 「no model tokens」as stall even while tools ran; short `timeout_seconds` still hits Rust ~60s idle-after-output |

Partial mitigations already in tree (must be completed + tested, not redesigned):

- FE: `shouldAbortThinkingIdle` skips when `hasRunningTool` / approval / ask ([`thinkingIdleAbort.ts`](../../../src/lib/aiEngineer/thinkingIdleAbort.ts))
- Sidecar: `is_progress_stalled` returns false when `pending_tool|pending_user|pending_approval` ([`stall.py`](../../../agent-sidecar/app/agent/stall.py))

## Design decisions (locked)

| Topic | Decision |
|-------|----------|
| Approach | **Hard resume + continue harness** on existing SessionLog; no Cloud runner |
| Resume miss | **Never silent thin fallback when client asked to resume.** Fail loudly to FE with a system/harness line; optional one-shot 「继续仍用文字历史」only after user confirms (default: surface error and keep `lastRunId`) |
| Continue detection | **Generic** — user asks to continue unfinished work (language-agnostic intent via model + status-bar Goal). No keyword blacklist / product special-cases. Prompt + AGENT_STATUS Goal make prior unfinished goal explicit |
| Evidence authority | Resumed SessionLog tool results are the source of truth for 「what already ran」; UI chat lines alone are not enough |
| Host progress before retry | On continue of a long job, prefer read-only verify (size/ps/logs) before re-issuing the same mutating download/install — already sketched in prompts; reinforce via status bar + harness nudge, not command templates |
| Long-run bar | Same as Cursor local: app open + SSH connected. Align with SSH-lease spec for channel idle; this spec owns **model-side** mis-kill and **continue** semantics |
| Stall meaning | `run_stalled` = model side dead **and** no pending host/user/approval wait. UI copy must say that |
| P1 memory | Deferred |

## §1 Same-thread continue (P0)

### 1.1 Client contract

On every send in an existing thread:

1. Prefer `resume_run_id = thread.lastRunId` (already done).
2. Always send a short `history` tail as **fallback display context only** — not a substitute for SessionLog when resume was requested.
3. Persist `lastRunId` on every successful `chat/start` / continue that returns a run id (already done). Clear `lastRunId` only when the thread is deleted or user explicitly starts a **new** run that is not a resume (rare; default keep).

### 1.2 Sidecar: resume miss must not lie

When `body.resume_run_id` is set and `create_run_resuming` returns `None`:

1. **Do not** seed a fresh run with thin history and pretend resume succeeded.
2. Return a structured error (HTTP 4xx or start response with `ok=false` / `resume_miss=true` — pick one approach in implementation plan; prefer explicit field on `ChatStartResponse` so FE can stay on SSE-friendly path if needed).
3. Emit audit `resume_miss` with `{session_id, resume_run_id}`.
4. FE shows a harness/system line (i18n): SessionLog unavailable — cannot continue with tool evidence; offer 「用当前聊天文字重开」as a **second** user action that sends **without** `resume_run_id`.

When resume succeeds: keep emitting `session_resumed` (FE already maps to a `resumed` system line).

### 1.3 Prompt + status bar (continue semantics)

Adjust SYSTEM_PROMPT (Linux + K8S) without product names:

- Keep 「latest user message is the task」.
- Add: when that message asks to continue unfinished work, **SessionLog tool evidence is authoritative**; do not re-plan from scratch; verify host state first if a long job may still be running.
- Keep language / inventory rules unchanged.

AGENT_STATUS ([`status_bar.py`](../../../agent-sidecar/app/agent/status_bar.py)):

- Goal field: if resume metadata has `resumed_from`, prefix Goal with a short 「continuing prior run」marker + truncated prior goal / last user task from log (generic).
- Optional Constraints bit: `resume_miss` never reaches the model (blocked at start).

### 1.4 Compaction

When compressing mid-task, durable summary **must** retain:

- Current user goal (latest unfinished objective)
- Last verified host state bullets (paths, exit codes, sizes) when present in retained events

Reuse continuity compaction preferences; no new engine.

### 1.5 Flow

```
user: 继续
  → FE resume_run_id=lastRunId
  → create_run_resuming
       ├─ ok → session_resumed + SessionLog tools → model continues
       └─ miss → resume_miss to FE (no thin fake) → user chooses reopen-without-resume
```

## §2 Cursor-local long run (P0) — model-side anti-false-kill

Complements SSH-lease spec (channel / reconnect). This section owns FE + sidecar **run** lifetime while host tools are in flight.

### 2.1 FE thinking idle

- Keep `shouldAbortThinkingIdle`: abort only when `busy` and idle ≥ threshold **and** no running tool card, no pending approval, no pending ask.
- Threshold remains ~5 minutes for true model hangs with no host wait.
- Ensure every in-flight `terminal_exec` (and other host tools) keeps a tool line `status=running` until tool_result / cancel — otherwise idle abort falsely fires.
- Copy: abort reason distinguishes 「模型无响应」vs 「主机任务进行中」.

### 2.2 Sidecar progress stall

- Keep `is_progress_stalled` skip when `pending_tool|pending_user|pending_approval`.
- Cold-start `is_stalled` unchanged (never entered model).
- `run_stalled` event payload already carries reason; FE must not show it as 「下载失败」when it was model-idle with no pending tool (shouldn't happen after skip).

### 2.3 Long-job timeout selection (generic)

- Prompts already tell the model to set hour-scale `timeout_seconds` for large IO.
- Align with lease spec: `timeout_seconds >= 600` disables Rust idle-after-output.
- Harness nudge (generic): if a tool result is TOOL_TIMEOUT / timed_out with `host_may_still_be_running`, next sample must verify before re-pull — existing verify path; add tests, not product rules.
- Optional (if not already): when model omits timeout on a command that is still running past short idle, do **not** invent per-app timeouts — rely on model + user continue after TOOL_TIMEOUT.

### 2.4 UI

- Tool card while `status=running`: show 「主机任务进行中」+ elapsed (reuse busy-dots / status work if present).
- `run_stalled`: only 「模型侧无进度」; never imply the remote file disappeared.

### 2.5 Boundary vs Cloud

Document in UI / help only if needed: long jobs require app open and SSH connected. Closing the app may cancel the wait; remote process may still run — continue later must verify (same as local Cursor).

## §3 Out of scope / P1

- Half-automatic cross-thread memory extract → confirm → inject (host continuity memory already exists as opt-in tools).
- Wall-clock 12h / SSH lease implementation details — owned by `2026-09-17-long-running-agent-ssh-lease-design.md`; implement or finish that plan separately if not landed, but do not block §1.

## Hardcoding gate

All changes must pass:

```bash
node scripts/check-no-agent-hardcoding.mjs
```

Forbidden: continue-phrase regex blacklists tied to products; per-CLI timeout tables; year-append; naming ollama/sglang/etc. in prompts or gateway branches.

Allowed: generic resume_miss errors; generic pending_tool stall skip; generic 「continue unfinished work」prompt language; `timeout_seconds>=600` threshold already locked in lease spec.

## Acceptance / tests

1. **Resume hit:** same thread second message with `lastRunId` → `session_resumed` event; surface messages include prior tool results (pytest: extend `test_session_resume.py`).
2. **Resume miss:** `resume_run_id` unknown → no silent thin seed; FE shows harness error; second send without resume_run_id still works (sidecar + FE unit).
3. **Continue prompt:** unit/snapshot that SYSTEM_PROMPT contains continue-with-evidence language and does not drop 「latest message is the task」.
4. **FE idle:** `shouldAbortThinkingIdle` false when `hasRunningTool` even if idleMs ≫ threshold (existing tests keep green).
5. **Sidecar stall:** `is_progress_stalled` false with `pending_tool` set for hours-scale `now` delta (existing `test_stall_watch.py`).
6. **Long idle channel:** covered by lease / idle-timeout specs — regression: short jobs still idle-kill ~60s.
7. **Hardcoding + matrix:** smoke + `docs/TEST_MATRIX.md` row for continue-task / resume_miss.
8. **Full:** `./scripts/run-all-tests.sh` before claim done.

## Implementation order

1. Sidecar resume_miss (break silent fallback) + tests  
2. FE surface resume_miss + optional reopen-without-resume  
3. Prompt + status-bar continue semantics  
4. Finish / verify stall + thinking-idle wiring end-to-end (store uses running tool detection)  
5. Compaction summary fields if missing  
6. TEST_MATRIX + full suite  

## Success criteria (product)

- Same chat「继续」: either continues with tool evidence, or clearly says SessionLog missing — never silently amnesiac.
- Sparse multi-GB download while app+SSH up: no false `run_stalled` / thinking-idle abort solely from quiet model.
- No claim of Cloud-style disconnect survival.

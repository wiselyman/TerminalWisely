# Long-running Agent + SSH Lease Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cursor-aligned long-running AI on the existing SSH session: hours-long host jobs without idle channel kills, no SSH reconnect while AI holds a lease, and loud failure when a run stalls with no model progress.

**Architecture:** FE + Rust session lease blocks reconnect; all SSH connects use stronger keepalive (no mid-run reconfig). Long `timeout_seconds` disables exec `idle_after_output`. Sidecar stall watchdog + wall-clock budget fail stuck/infinite runs. UI shows lease banner and long-wait progress.

**Tech Stack:** Tauri/Rust (russh), React/Zustand, agent-sidecar (FastAPI/asyncio), Vitest, pytest, cargo test.

**Spec:** `docs/superpowers/specs/2026-09-17-long-running-agent-ssh-lease-design.md`

## Global Constraints

- No second SSH / no PTY scrape for AI remote commands.
- No per-app or per-model hardcoding (no vLLM/ollama/Nemotron branches).
- No silent reconnect during AI lease.
- `node scripts/check-no-agent-hardcoding.mjs` must PASS.
- New behavior needs tests; finish with `./scripts/run-all-tests.sh`.
- Author commits as user identity only when the user asks to commit (plan commit steps are optional gates).

### Locked parameters (from open items in spec)

| Param | Value |
|-------|--------|
| SSH keepalive (all connects) | interval **10s**, max **30** (~5 min miss → drop) |
| Long-job threshold | `timeout_seconds >= 600` → `idle_after_output = None` |
| Long-job `first_output` | `min(300s, total)` |
| Short-job idle | keep **60s** (existing) |
| STALLED N | **90s** (`TW_AI_STALL_SECONDS`, default 90) |
| Wall-clock max | **43200s / 12h** (`TW_AI_MAX_RUN_WALL_SECONDS`) |

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/aiEngineer/sshLease.ts` | Pure helpers: may auto/manual reconnect under lease |
| `src/lib/aiEngineer/sshLease.test.ts` | Unit tests for helpers |
| `src/stores/aiEngineerStore.ts` | `leasedSessionIds`, set/clear on run lifecycle; invoke Rust lease |
| `src/stores/sessionStore.ts` | `reconnectSession` refuses when leased |
| `src/components/TerminalView.tsx` | Skip auto-reconnect + banner when leased |
| `src/i18n/locales/{en,zh-CN}/tools.json` (+ sessions if needed) | Lease / stall / long-wait copy |
| `src-tauri/src/session/mod.rs` | `ai_ssh_leases: HashSet`, set/clear/check |
| `src-tauri/src/commands/mod.rs` | `set_ai_ssh_lease` command; gate `reconnect_ssh_session` |
| `src-tauri/src/ssh/client.rs` | Stronger default keepalive 10s×30 |
| `src-tauri/src/ai_engineer/terminal.rs` | `ai_exec_limits` long-job branch; unit tests |
| `agent-sidecar/app/paths.py` | `max_run_wall_seconds`, `stall_seconds` |
| `agent-sidecar/app/agent/stall.py` | Stall detector helpers |
| `agent-sidecar/app/main.py` | Wrap graph task with stall watch |
| `agent-sidecar/app/agent/loop.py` | Mark model touch; wall-clock in `_check_budgets` |
| `agent-sidecar/app/llm/gateway.py` | Optional: no change if loop marks touch before HTTP |
| `src/components/aiEngineer/AiEngineerRunTraceBar.tsx` | Long-wait elapsed / progress snippet |
| `docs/TEST_MATRIX.md` | New rows |
| Tests | listed per task |

---

### Task 1: SSH lease pure helpers (FE)

**Files:**
- Create: `src/lib/aiEngineer/sshLease.ts`
- Create: `src/lib/aiEngineer/sshLease.test.ts`

**Interfaces:**
- Produces:
  - `export function isAiSshLeased(leasedSessionIds: ReadonlySet<string>, sessionId: string): boolean`
  - `export function shouldAutoReconnectSsh(opts: { kind: string; isDisconnected: boolean; leased: boolean }): boolean`
  - `export function shouldAllowManualReconnectSsh(leased: boolean): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  isAiSshLeased,
  shouldAllowManualReconnectSsh,
  shouldAutoReconnectSsh,
} from "./sshLease";

describe("sshLease", () => {
  it("detects lease membership", () => {
    expect(isAiSshLeased(new Set(["a"]), "a")).toBe(true);
    expect(isAiSshLeased(new Set(["a"]), "b")).toBe(false);
  });

  it("blocks auto-reconnect while leased", () => {
    expect(
      shouldAutoReconnectSsh({
        kind: "ssh",
        isDisconnected: true,
        leased: true,
      }),
    ).toBe(false);
  });

  it("allows auto-reconnect when disconnected ssh and not leased", () => {
    expect(
      shouldAutoReconnectSsh({
        kind: "ssh",
        isDisconnected: true,
        leased: false,
      }),
    ).toBe(true);
  });

  it("blocks manual reconnect while leased", () => {
    expect(shouldAllowManualReconnectSsh(true)).toBe(false);
    expect(shouldAllowManualReconnectSsh(false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm test -- --run src/lib/aiEngineer/sshLease.test.ts`  
Expected: FAIL module not found

- [ ] **Step 3: Minimal implementation**

```ts
export function isAiSshLeased(
  leasedSessionIds: ReadonlySet<string>,
  sessionId: string,
): boolean {
  return Boolean(sessionId) && leasedSessionIds.has(sessionId);
}

export function shouldAutoReconnectSsh(opts: {
  kind: string;
  isDisconnected: boolean;
  leased: boolean;
}): boolean {
  if (opts.leased) return false;
  return opts.kind === "ssh" && opts.isDisconnected;
}

export function shouldAllowManualReconnectSsh(leased: boolean): boolean {
  return !leased;
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npm test -- --run src/lib/aiEngineer/sshLease.test.ts`

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add src/lib/aiEngineer/sshLease.ts src/lib/aiEngineer/sshLease.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): add SSH lease reconnect policy helpers

EOF
)"
```

---

### Task 2: FE lease state + reconnect gates

**Files:**
- Modify: `src/stores/aiEngineerStore.ts`
- Modify: `src/stores/sessionStore.ts`
- Modify: `src/components/TerminalView.tsx`
- Modify: `src/i18n/locales/en/tools.json`
- Modify: `src/i18n/locales/zh-CN/tools.json`
- Test: extend or add `src/stores/aiEngineerStore.sshLease.test.ts` if store logic is extractable; otherwise rely on Task 1 + thin wiring smoke

**Interfaces:**
- Consumes: Task 1 helpers
- Produces:
  - Store: `leasedSessionIds: Set<string>` (serialize carefully if persist — prefer **non-persisted** runtime Set on the store object, or `Record<string, true>`)
  - `acquireAiSshLease(sessionId: string)`, `releaseAiSshLease(sessionId: string)`
  - On chat start success / continue: `acquireAiSshLease(sessionId)`
  - On `stopActiveRun`, terminal statuses, abort-with-cancel: `releaseAiSshLease`
  - Also `invoke("set_ai_ssh_lease", { sessionId, active: true|false })` (Task 3 adds command — stub invoke behind try/catch until Task 3, or implement Task 3 first)

**Preferred order note:** Implement Task 3 Rust command before wiring invoke, or no-op catch.

- [ ] **Step 1: i18n keys**

`en/tools.json` / `zh-CN/tools.json` under an `sshLease` (or `aiSsh`) object:

```json
"sshLease": {
  "blockedReconnect": "AI is using this session. Stop AI before reconnecting SSH.",
  "blockedReconnectZh": "AI 正在使用此会话。请先 STOP AI，再重连 SSH。",
  "disconnectBanner": "SSH disconnected while AI holds this session. Stop AI first — reconnect is disabled."
}
```

Use existing i18n pattern (en file English; zh-CN file Chinese — do not dual-key in one file).

- [ ] **Step 2: Store lease set**

In `aiEngineerStore.ts`:

- Add `leasedSessionIds: Record<string, true>` (JSON-friendly) default `{}`.
- `acquireAiSshLease(sessionId)` / `releaseAiSshLease(sessionId)`.
- Call acquire after successful chat start/continue when `sessionId` known.
- Call release in `stopActiveRun`, when run hits terminal status in stream handler, and when switching scope cancels the run.

- [ ] **Step 3: Gate `sessionStore.reconnectSession`**

At start of `reconnectSession`:

```ts
const leased = Boolean(
  useAiEngineerStore.getState().leasedSessionIds[sessionId],
);
if (!shouldAllowManualReconnectSsh(leased)) {
  if (!options?.silent) {
    useToastStore.getState().pushToast(
      i18n.t("tools:sshLease.blockedReconnect"),
      false,
    );
  }
  return false;
}
```

Avoid circular import issues: prefer reading lease via a tiny `getAiSshLease(sessionId)` in `sshLease.ts` that imports store lazily, or keep check inline in sessionStore with dynamic import. Follow existing cross-store patterns in the repo.

- [ ] **Step 4: Gate TerminalView auto-reconnect**

Change the effect at `TerminalView.tsx` ~849:

```ts
const leased = useAiEngineerStore((s) => Boolean(s.leasedSessionIds[sessionId]));
useEffect(() => {
  if (
    !shouldAutoReconnectSsh({
      kind,
      isDisconnected,
      leased,
    })
  ) {
    autoReconnectAttemptRef.current = 0;
    setAutoReconnecting(false);
    return;
  }
  // ... existing attempt loop
}, [isDisconnected, kind, reconnectSession, sessionId, leased]);
```

Banner when `isDisconnected && leased`: show `tools:sshLease.disconnectBanner`; hide/disable Reconnect button (or onClick toast).

- [ ] **Step 5: Manual smoke**

Run: `npm test -- --run src/lib/aiEngineer/sshLease.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit (only if user asked)**

---

### Task 3: Rust AI SSH lease + stronger keepalive

**Files:**
- Modify: `src-tauri/src/session/mod.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs` (register command)
- Modify: `src-tauri/src/ssh/client.rs` (`ssh_client_config`)
- Modify: `src/e2e/tauriCoreMock.ts` — mock `set_ai_ssh_lease`
- Test: `src-tauri/src/session/mod.rs` `#[cfg(test)]` or new `ai_ssh_lease` tests module

**Interfaces:**
- Produces:
  - `SessionManager::{set_ai_ssh_lease(session_id, active), is_ai_ssh_leased(session_id)}`
  - Command: `set_ai_ssh_lease(session_id: String, active: bool)`
  - `reconnect_ssh` returns `AppError` code e.g. `ERR_AI_SSH_LEASE` when leased
  - Keepalive: `keepalive_interval: 10s`, `keepalive_max: 30`

- [ ] **Step 1: Failing Rust test for lease gate**

Add unit test on SessionManager (in-memory) that after `set_ai_ssh_lease(id, true)`, `reconnect_ssh` errs with lease code. If reconnect needs live SSH, test only `is_ai_ssh_leased` + a small `assert_reconnect_allowed` helper:

```rust
pub fn assert_reconnect_allowed(leased: bool) -> AppResult<()> {
    if leased {
        return Err(AppError::code("ERR_AI_SSH_LEASE"));
    }
    Ok(())
}

#[test]
fn reconnect_blocked_when_ai_lease_active() {
    assert!(assert_reconnect_allowed(true).is_err());
    assert!(assert_reconnect_allowed(false).is_ok());
}
```

- [ ] **Step 2: Run — expect FAIL** then implement helper + HashSet on SessionManager

```rust
// SessionManager fields
ai_ssh_leases: Mutex<HashSet<String>>,

pub async fn set_ai_ssh_lease(&self, session_id: &str, active: bool) {
    let mut g = self.ai_ssh_leases.lock().await;
    if active {
        g.insert(session_id.to_string());
    } else {
        g.remove(session_id);
    }
}

pub async fn is_ai_ssh_leased(&self, session_id: &str) -> bool {
    self.ai_ssh_leases.lock().await.contains(session_id)
}
```

In `reconnect_ssh` before work:

```rust
if self.is_ai_ssh_leased(session_id).await {
    return Err(AppError::code("ERR_AI_SSH_LEASE"));
}
```

- [ ] **Step 3: Keepalive defaults**

In `ssh_client_config`:

```rust
keepalive_interval: Some(Duration::from_secs(10)),
keepalive_max: 30,
```

- [ ] **Step 4: Register command + FE invoke from acquire/release**

```rust
#[tauri::command]
pub async fn set_ai_ssh_lease(
    sessions: State<'_, SessionManager>,
    session_id: String,
    active: bool,
) -> Result<(), String> {
    sessions.set_ai_ssh_lease(&session_id, active).await;
    Ok(())
}
```

Wire FE `acquireAiSshLease` / `releaseAiSshLease` to invoke this.

- [ ] **Step 5: `cargo test` for new tests**

Run: `cd src-tauri && cargo test assert_reconnect_allowed -- --nocapture`  
Expected: PASS

- [ ] **Step 6: Commit (only if user asked)**

---

### Task 4: Long-job `ai_exec_limits` (disable idle)

**Files:**
- Modify: `src-tauri/src/ai_engineer/terminal.rs`
- Test: same file `#[cfg(test)]` module

**Interfaces:**
- Produces: `pub(crate) fn ai_exec_limits(timeout_seconds: Option<u64>) -> ExecCaptureLimits` (make testable)
- Constants: `LONG_JOB_TIMEOUT_SECS: u64 = 600`, `AI_FIRST_OUTPUT_LONG: Duration = 300s`

- [ ] **Step 1: Failing tests**

```rust
#[cfg(test)]
mod ai_exec_limits_tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn short_job_keeps_idle_after_output() {
        let lim = ai_exec_limits(Some(120));
        assert_eq!(lim.idle_after_output, Some(Duration::from_secs(60).min(Duration::from_secs(120))));
    }

    #[test]
    fn long_job_disables_idle_after_output() {
        let lim = ai_exec_limits(Some(3600));
        assert_eq!(lim.idle_after_output, None);
        assert_eq!(lim.total, Some(Duration::from_secs(3600)));
        assert_eq!(lim.first_output, Some(Duration::from_secs(300)));
    }

    #[test]
    fn default_timeout_keeps_idle() {
        let lim = ai_exec_limits(None); // 7200 total today
        // Spec: only disable idle when timeout_seconds >= 600.
        // None uses AI_TOTAL_TIMEOUT 7200 → treat as long job.
        assert_eq!(lim.idle_after_output, None);
    }
}
```

**Decision locked:** `timeout_seconds == None` uses default total 7200 ≥ 600 → **long-job path** (idle off). Short interactive probes must pass explicit `timeout_seconds < 600`.

- [ ] **Step 2: Run — FAIL**, then implement:

```rust
const LONG_JOB_TIMEOUT_SECS: u64 = 600;
const AI_FIRST_OUTPUT_LONG: Duration = Duration::from_secs(300);

fn ai_exec_limits(timeout_seconds: Option<u64>) -> ExecCaptureLimits {
    let total_secs = timeout_seconds
        .unwrap_or(AI_TOTAL_TIMEOUT.as_secs())
        .clamp(5, 86_400);
    let total = Duration::from_secs(total_secs);
    let long_job = total_secs >= LONG_JOB_TIMEOUT_SECS;
    let first = if long_job {
        AI_FIRST_OUTPUT_LONG.min(total)
    } else {
        AI_FIRST_OUTPUT_TIMEOUT.min(total)
    };
    ExecCaptureLimits {
        first_output: Some(first),
        total: Some(total),
        idle_after_output: if long_job {
            None
        } else {
            Some(AI_IDLE_AFTER_OUTPUT.min(total))
        },
        abort_on_interactive_password: true,
    }
}
```

- [ ] **Step 3: `cargo test ai_exec_limits_tests`**

Expected: PASS

- [ ] **Step 4: Commit (only if user asked)**

---

### Task 5: Stall watchdog + wall-clock budget (sidecar)

**Files:**
- Modify: `agent-sidecar/app/paths.py`
- Create: `agent-sidecar/app/agent/stall.py`
- Create: `agent-sidecar/tests/test_stall_watch.py`
- Modify: `agent-sidecar/app/main.py` — wrap start task
- Modify: `agent-sidecar/app/agent/loop.py` — model touch + wall budget
- Modify: `agent-sidecar/tests/test_agent_loop_fake.py` — wall budget if easy

**Interfaces:**
- Produces:
  - `paths.stall_seconds() -> float` default 90
  - `paths.max_run_wall_seconds() -> float` default 43200
  - `stall.is_stalled(run, *, now: float) -> bool`
  - `async def watch_run_for_stall(run: AgentRun) -> None`
  - `run.metadata["_model_touch_at"] = time.time()` at start of `_stream_assistant_turn_once` (before HTTP)
  - Event `run_stalled` then `_emit_conclusion(FAILED, ...)`

- [ ] **Step 1: Failing unit tests for `is_stalled`**

```python
# agent-sidecar/tests/test_stall_watch.py
from app.agent.stall import is_stalled
from app.state import AgentRun, RunStatus

def test_stalled_when_running_no_events_no_model_touch():
    run = AgentRun(session_id="s", run_id="r", status=RunStatus.RUNNING)
    run.created_at = 1000.0
    assert is_stalled(run, now=1091.0, stall_seconds=90.0) is True

def test_not_stalled_before_threshold():
    run = AgentRun(session_id="s", run_id="r", status=RunStatus.RUNNING)
    run.created_at = 1000.0
    assert is_stalled(run, now=1050.0, stall_seconds=90.0) is False

def test_not_stalled_after_model_touch():
    run = AgentRun(session_id="s", run_id="r", status=RunStatus.RUNNING)
    run.created_at = 1000.0
    run.metadata["_model_touch_at"] = 1001.0
    assert is_stalled(run, now=1200.0, stall_seconds=90.0) is False

def test_not_stalled_when_waiting_tool():
    run = AgentRun(session_id="s", run_id="r", status=RunStatus.WAITING_TOOL)
    run.created_at = 1000.0
    assert is_stalled(run, now=2000.0, stall_seconds=90.0) is False
```

- [ ] **Step 2: Implement `stall.py`**

```python
def is_stalled(run, *, now: float, stall_seconds: float) -> bool:
    if run.status != RunStatus.RUNNING:
        return False
    if run.metadata.get("_model_touch_at"):
        return False
    if run.events:
        return False
    return (now - float(run.created_at)) >= float(stall_seconds)
```

Watch loop:

```python
async def watch_run_for_stall(run: AgentRun) -> None:
    from app import paths
    n = paths.stall_seconds()
    try:
        while run.status == RunStatus.RUNNING and not run.cancel_requested:
            await asyncio.sleep(min(5.0, n / 3))
            if is_stalled(run, now=time.time(), stall_seconds=n):
                run.error = f"run stalled: no model progress within {n:.0f}s"
                run.append_event("run_stalled", {"stall_seconds": n})
                run.status = RunStatus.FAILED
                if run.task and not run.task.done():
                    run.task.cancel()
                return
    except asyncio.CancelledError:
        return
```

- [ ] **Step 3: Wire in `main.py`**

Where `loop_task = asyncio.create_task(start_run_via_graph(...))`:

```python
loop_task = asyncio.create_task(start_run_via_graph(run, user_message))
run.task = loop_task
stall_task = asyncio.create_task(watch_run_for_stall(run))
# store stall_task on run.metadata["_stall_task"] or AgentRun field if needed for cancel
```

On cancel_run, cancel stall task if present.

- [ ] **Step 4: Model touch + wall clock in loop**

At the very beginning of `_stream_assistant_turn_once`:

```python
self.run.metadata["_model_touch_at"] = time.time()
```

In `_check_budgets`:

```python
wall = time.time() - float(self.run.created_at)
if wall > paths.max_run_wall_seconds():
    raise BudgetExceeded(
        f"max wall-clock run time exceeded ({paths.max_run_wall_seconds()}s)"
    )
```

Add `max_run_wall_seconds` / `stall_seconds` to `paths.py`.

- [ ] **Step 5: pytest**

Run: `cd agent-sidecar && pytest tests/test_stall_watch.py -q`  
Expected: PASS

Also run a quick subset: `pytest tests/test_agent_loop_fake.py -q`

- [ ] **Step 6: Commit (only if user asked)**

---

### Task 6: FE stall + long-wait UI

**Files:**
- Modify: `src/lib/aiEngineer/chatClient.ts` — handle `run_stalled` event
- Modify: `src/stores/aiEngineerStore.ts` — surface error; `releaseAiSshLease` on stall/fail
- Modify: `src/components/aiEngineer/AiEngineerRunTraceBar.tsx` — show waiting elapsed when `waiting_tool` + last chunk
- Modify: i18n `tools.json` en + zh-CN

**Interfaces:**
- Consumes: stream event `run_stalled`
- Produces: user-visible notice; lease cleared on failed/cancelled/completed

- [ ] **Step 1: Parse `run_stalled` in chatClient** (same pattern as `tool_timeout`)

Emit store notice / set run error message from payload.

- [ ] **Step 2: RunTraceBar**

When status is `waiting_tool` (or host exec streaming): show elapsed since wait start + last stdout/stderr snippet already tracked if any. Reuse existing trace spans; add a compact line:

`Host job · 12m 04s`  

i18n: `tools:longJob.inProgress`

- [ ] **Step 3: Ensure lease release on terminal stream statuses** including stalled→failed

- [ ] **Step 4: Vitest for any new pure formatter** (elapsed string) if extracted

- [ ] **Step 5: Commit (only if user asked)**

---

### Task 7: TEST_MATRIX + hardcoding gate + full suite

**Files:**
- Modify: `docs/TEST_MATRIX.md` (section 9 AI Engineer)
- Modify: `docs/superpowers/specs/2026-09-17-long-running-agent-ssh-lease-design.md` — Status: Approved for implementation

- [ ] **Step 1: Add matrix rows**

| 功能 | 单元 | 集成 | … |
|------|------|------|---|
| AI SSH lease blocks reconnect | `sshLease.test` + Rust lease | — | … |
| Long-job exec idle disabled | Rust `ai_exec_limits_tests` | — | … |
| Run stall watchdog | `test_stall_watch` | — | … |
| Wall-clock run budget | paths + loop budget | — | … |

- [ ] **Step 2: Hardcoding gate**

Run: `node scripts/check-no-agent-hardcoding.mjs`  
Expected: PASS

- [ ] **Step 3: Full suite**

Run: `./scripts/run-all-tests.sh`  
Expected: all PASS

- [ ] **Step 4: Commit all remaining (only if user asked)**

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| SSH lease FE freeze auto-reconnect | 1–2 |
| Block manual reconnect | 2–3 |
| Keepalive harden | 3 (global 10s×30) |
| Same handle exec | unchanged; verified by existing path |
| Long-job idle off | 4 |
| Short-job idle 60s | 4 regression test |
| TOOL_TIMEOUT host may still run | existing; no product-specific change |
| Stall watchdog | 5–6 |
| Wall-clock | 5 |
| UI long-wait / lease banner | 2, 6 |
| TEST_MATRIX + hardcoding | 7 |
| No Cloud VM | N/A (out of scope) |

## Placeholder / consistency self-review

- No TBD left; parameters locked in header.
- `leasedSessionIds` naming consistent FE↔Rust command `set_ai_ssh_lease`.
- Default `timeout_seconds=None` → long-job (idle off) documented in Task 4.
- Keepalive changed globally (cannot reconfigure mid-lease without reconnect).

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-09-17-long-running-agent-ssh-lease.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session, executing-plans with checkpoints  

Which approach?

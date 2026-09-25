# Same-thread Continue + Cursor-local Long Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Same-chat「继续」must resume SessionLog tool evidence (or hard-fail resume_miss); long host jobs must not be false-killed by model-idle watchdogs while tools/approvals are pending — Cursor local bar only.

**Architecture:** Break silent thin-history fallback on `resume_run_id` miss (HTTP 409). FE surfaces harness notice and one-shot reopen without resume. Prompt + AGENT_STATUS mark continuing runs. Compaction summary keeps unfinished goal. Stall/FE idle skips already exist — verify and i18n only.

**Tech Stack:** FastAPI sidecar (Pydantic v2), React/Zustand, Vitest, pytest, i18n `tools.json`.

**Spec:** `docs/superpowers/specs/2026-09-25-continue-task-and-long-run-design.md`

## Global Constraints

- No Cursor Cloud / disconnect survival claims.
- No per-app / product hardcoding; `node scripts/check-no-agent-hardcoding.mjs` PASS.
- No second SSH / PTY scrape.
- New behavior needs tests; finish with `./scripts/run-all-tests.sh`.
- Git commits only when the user asks (treat commit steps as optional gates).
- SSH lease / `timeout_seconds>=600` idle-off owned by `2026-09-17-long-running-agent-ssh-lease` — do not re-implement here.

---

## File map

| File | Responsibility |
|------|----------------|
| `agent-sidecar/app/main.py` | `chat_start`: resume miss → 409, no thin seed |
| `agent-sidecar/tests/test_session_resume.py` | resume_miss + hit regression |
| `agent-sidecar/app/agent/prompts.py` | Continue-with-evidence language |
| `agent-sidecar/app/agent/status_bar.py` | Goal prefix when `resumed_from` |
| `agent-sidecar/tests/test_status_bar.py` | Continuing goal marker |
| `agent-sidecar/app/session/compaction.py` | Summary prompt: unfinished goal |
| `agent-sidecar/tests/test_compaction.py` or existing | Prompt string assertion |
| `src/lib/aiEngineer/chatClient.ts` | Parse 409 resume_miss; typed error |
| `src/lib/aiEngineer/resumeMiss.ts` | Pure helper `isResumeMissError` / parse body |
| `src/lib/aiEngineer/resumeMiss.test.ts` | Unit tests |
| `src/stores/aiEngineerStore.ts` | Catch resume_miss; `skipNextResume`; harness notice |
| `src/i18n/locales/{en,zh-CN}/tools.json` | `resume_miss` + clearer `run_stalled` copy |
| `src/components/aiEngineer/AiEngineerPanel.tsx` | Union type for new notice key |
| `docs/TEST_MATRIX.md` | New row for resume_miss |

---

### Task 1: Sidecar resume_miss (no silent thin fallback)

**Files:**
- Modify: `agent-sidecar/app/main.py` (chat_start resume branch ~147–168)
- Modify: `agent-sidecar/tests/test_session_resume.py`
- Test: `agent-sidecar/tests/test_session_resume.py`

**Interfaces:**
- Consumes: `STORE.create_run_resuming(...) -> AgentRun | None`
- Produces: HTTP **409** with `detail={"error":"resume_miss","session_id":str,"resume_run_id":str}`; audit `resume_miss`

- [ ] **Step 1: Write the failing test**

Append to `agent-sidecar/tests/test_session_resume.py`:

```python
def test_chat_start_resume_miss_does_not_thin_seed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    model = ScriptedModel(
        [{"role": "assistant", "content": "should not run", "tool_calls": []}]
    )
    _patch_model(monkeypatch, model)

    with TestClient(app) as client:
        r = client.post(
            "/v1/chat/start",
            headers=_auth(),
            json={
                "session_id": "sess-miss",
                "message": "继续",
                "resume_run_id": "does-not-exist",
                "history": [
                    {"role": "user", "content": "old"},
                    {"role": "assistant", "content": "reply"},
                ],
            },
        )
        assert r.status_code == 409, r.text
        detail = r.json()["detail"]
        assert detail["error"] == "resume_miss"
        assert detail["resume_run_id"] == "does-not-exist"
        assert detail["session_id"] == "sess-miss"
        assert model.i == 0
        assert STORE.get_session_run("sess-miss") is None
```

Keep existing `test_chat_start_resume_run_id` green (hit path).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent-sidecar && pytest tests/test_session_resume.py::test_chat_start_resume_miss_does_not_thin_seed -v`

Expected: FAIL — status 200 (today silently seeds) or wrong body.

- [ ] **Step 3: Implement minimal fix in `chat_start`**

Replace the miss branch so it does **not** call `create_run` + `_seed_history`. Import `HTTPException` if missing.

```python
    if body.resume_run_id:
        run = STORE.create_run_resuming(
            body.session_id,
            body.resume_run_id,
            security_mode=mode,
            interaction_mode=interaction,
            identity=identity,
            metadata=body.metadata,
            new_run_id=body.run_id,
        )
        if run is None:
            STORE.audit(
                "resume_miss",
                {
                    "session_id": body.session_id,
                    "resume_run_id": body.resume_run_id,
                },
            )
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "resume_miss",
                    "session_id": body.session_id,
                    "resume_run_id": body.resume_run_id,
                },
            )
        resumed_from = body.resume_run_id
        run.interaction_mode = interaction
        run.append_event(
            "session_resumed",
            {"from_run_id": body.resume_run_id, "messages": len(run.messages)},
        )
    else:
        run = STORE.create_run(...)
        # existing history seed path unchanged when resume_run_id is absent
```

Do **not** change the `else` path (no resume requested → thin history still OK for brand-new threads).

- [ ] **Step 4: Run resume tests**

Run: `cd agent-sidecar && pytest tests/test_session_resume.py -v`

Expected: all PASS including hit + miss.

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add agent-sidecar/app/main.py agent-sidecar/tests/test_session_resume.py
git commit -m "$(cat <<'EOF'
fix(ai): hard-fail SessionLog resume miss instead of thin history

EOF
)"
```

---

### Task 2: FE resume_miss surface + one-shot reopen without resume

**Files:**
- Create: `src/lib/aiEngineer/resumeMiss.ts`
- Create: `src/lib/aiEngineer/resumeMiss.test.ts`
- Modify: `src/lib/aiEngineer/chatClient.ts` (`runAgentChat` start handling)
- Modify: `src/stores/aiEngineerStore.ts` (`ChatThread` + send path)
- Modify: `src/i18n/locales/en/tools.json`, `src/i18n/locales/zh-CN/tools.json`
- Modify: `src/components/aiEngineer/AiEngineerPanel.tsx` (notice key union)

**Interfaces:**
- Consumes: HTTP 409 `detail.error === "resume_miss"`
- Produces: `class ResumeMissError extends Error { resumeRunId: string }`; thread flag `skipNextResume?: boolean`; notice content `"resume_miss"`

- [ ] **Step 1: Write failing unit tests for parse helper**

`src/lib/aiEngineer/resumeMiss.ts`:

```typescript
export type ResumeMissDetail = {
  error: "resume_miss";
  session_id?: string;
  resume_run_id?: string;
};

export class ResumeMissError extends Error {
  readonly resumeRunId: string;
  constructor(resumeRunId: string) {
    super("resume_miss");
    this.name = "ResumeMissError";
    this.resumeRunId = resumeRunId;
  }
}

export function parseResumeMissBody(body: unknown): ResumeMissDetail | null {
  if (!body || typeof body !== "object") return null;
  const detail = (body as { detail?: unknown }).detail;
  const src =
    detail && typeof detail === "object"
      ? (detail as Record<string, unknown>)
      : (body as Record<string, unknown>);
  if (src.error !== "resume_miss") return null;
  return {
    error: "resume_miss",
    session_id: typeof src.session_id === "string" ? src.session_id : undefined,
    resume_run_id:
      typeof src.resume_run_id === "string" ? src.resume_run_id : undefined,
  };
}
```

`src/lib/aiEngineer/resumeMiss.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseResumeMissBody, ResumeMissError } from "./resumeMiss";

describe("parseResumeMissBody", () => {
  it("parses FastAPI detail envelope", () => {
    const d = parseResumeMissBody({
      detail: {
        error: "resume_miss",
        session_id: "s",
        resume_run_id: "r1",
      },
    });
    expect(d).toEqual({
      error: "resume_miss",
      session_id: "s",
      resume_run_id: "r1",
    });
  });

  it("returns null for other errors", () => {
    expect(parseResumeMissBody({ detail: "boom" })).toBeNull();
  });
});

describe("ResumeMissError", () => {
  it("is identifiable", () => {
    const e = new ResumeMissError("r1");
    expect(e).toBeInstanceOf(ResumeMissError);
    expect(e.resumeRunId).toBe("r1");
  });
});
```

- [ ] **Step 2: Run Vitest — expect FAIL until file exists**

Run: `npm test -- --run src/lib/aiEngineer/resumeMiss.test.ts`

Expected: FAIL (module missing) then PASS after Step 1 implementation.

- [ ] **Step 3: Wire `chatClient.runAgentChat`**

After `sidecarFetch` for `/v1/chat/start`:

```typescript
  if (!startRes.ok) {
    const text = await startRes.text();
    if (startRes.status === 409) {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      const miss = parseResumeMissBody(parsed);
      if (miss) {
        throw new ResumeMissError(miss.resume_run_id ?? resumeRunId ?? "");
      }
    }
    throw new Error(`chat start failed: ${startRes.status} ${text}`);
  }
```

Import `parseResumeMissBody`, `ResumeMissError` from `./resumeMiss`.

- [ ] **Step 4: Store — thread flag + catch**

On `ChatThread` type add optional `skipNextResume?: boolean`.

In send path where `resumeRunId` is computed (~1779):

```typescript
    const threadMeta = get()
      .threadsByScope[runScope]?.threads.find((t) => t.id === runThreadId);
    const skipResume = Boolean(threadMeta?.skipNextResume);
    const resumeRunId = skipResume
      ? null
      : (threadMeta?.lastRunId ?? null);
```

After deciding `resumeRunId`, if `skipResume`, clear the flag on that thread in the same `set`/commit that starts the run (so it is one-shot).

In the `runAgentChat` catch / error path:

```typescript
      if (err instanceof ResumeMissError) {
        // keep lastRunId; set skipNextResume so user can retry without SessionLog
        // append notice variant harness content "resume_miss"
        // set busy false; do not leave orphan run
        return;
      }
```

Exact patch: find the existing try/catch around `runAgentChat` in `sendMessage` / start chat; on `ResumeMissError`:

1. `appendIfSameThread({ kind: "notice", variant: "harness", content: "resume_miss" })`
2. Update thread: `{ ...t, skipNextResume: true }` (keep `lastRunId`)
3. `set({ busy: false, modelPhase: "idle" })` + clear lease if acquired
4. Do not rethrow as generic error (or also append error line with same key — prefer notice only)

- [ ] **Step 5: i18n + panel union**

en `tools.json`:

```json
"aiEngineer.notice.resume_miss": "Could not resume prior SessionLog (tool evidence missing). Send again to continue from chat text only.",
"aiEngineer.notice.run_stalled": "Model side stalled with no progress (no host tool waiting) — run failed. You can retry."
```

zh-CN:

```json
"aiEngineer.notice.resume_miss": "无法恢复先前 SessionLog（缺少工具证据）。再发送一次将仅用当前聊天文字继续。",
"aiEngineer.notice.run_stalled": "模型侧长时间无进度（且无主机工具等待）— 运行已失败。可重试。"
```

Add `"aiEngineer.notice.resume_miss"` to the TypeScript union in `AiEngineerPanel.tsx` harness `t(...)` cast.

- [ ] **Step 6: Run FE tests**

Run: `npm test -- --run src/lib/aiEngineer/resumeMiss.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit (only if user asked)**

```bash
git add src/lib/aiEngineer/resumeMiss.ts src/lib/aiEngineer/resumeMiss.test.ts \
  src/lib/aiEngineer/chatClient.ts src/stores/aiEngineerStore.ts \
  src/i18n/locales/en/tools.json src/i18n/locales/zh-CN/tools.json \
  src/components/aiEngineer/AiEngineerPanel.tsx
git commit -m "$(cat <<'EOF'
fix(ai): surface SessionLog resume_miss and one-shot text reopen

EOF
)"
```

---

### Task 3: Prompt + status bar continue semantics

**Files:**
- Modify: `agent-sidecar/app/agent/prompts.py` (SYSTEM_PROMPT + SYSTEM_PROMPT_K8S latest-message bullets)
- Modify: `agent-sidecar/app/agent/status_bar.py` (`build_status_bar` / `status_bar_for_run`)
- Modify: `agent-sidecar/tests/test_status_bar.py`
- Add or extend: pytest asserting prompt substring (small test in `tests/test_prompts_continue.py` if no existing prompts test)

**Interfaces:**
- Consumes: `run.metadata["resumed_from"]`
- Produces: Goal line like `- Goal: [continuing prior run] …`; prompt rule for evidence-first continue

- [ ] **Step 1: Failing status-bar test**

```python
def test_status_bar_marks_continuing_prior_run() -> None:
    run = AgentRun(session_id="s", run_id="r2")
    run.metadata["resumed_from"] = "r1"
    run.append_message({"role": "user", "content": "继续下载"})
    text = status_bar_for_run(run)
    assert "continuing prior run" in text.lower()
    assert "继续下载" in text or "Goal:" in text
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd agent-sidecar && pytest tests/test_status_bar.py::test_status_bar_marks_continuing_prior_run -v`

- [ ] **Step 3: Implement status bar**

In `status_bar_for_run`, pass `resumed_from=run.metadata.get("resumed_from")` into `build_status_bar`.

In `build_status_bar`, add optional `resumed_from: str | None = None`. When set and goal present:

```python
    if goal:
        if resumed_from:
            lines.append(f"- Goal: [continuing prior run] {goal}")
        else:
            lines.append(f"- Goal: {goal}")
```

Keep ≤800 chars budget (existing trim if any).

- [ ] **Step 4: Prompt edit (both Linux + K8S)**

Replace/extend the latest-message bullet so it still says latest is the task, and adds continue-with-evidence. Exact English (no product names):

```
- **The latest user message is the task.** Prior turns (including resumed SessionLog,
  unfinished builds, open plans, pending commands) are background context only.
  Fulfill the latest request; do not resume prior unfinished work unless that message
  itself asks to continue it. When it does ask to continue, treat SessionLog tool
  results as authoritative evidence of what already ran — verify live host state
  before re-issuing the same long download/install/build; do not restart from scratch
  without evidence that the prior job is dead or the user asked to redo it.
```

Mirror the same idea in `SYSTEM_PROMPT_K8S` latest-message bullet.

- [ ] **Step 5: Prompt regression test**

```python
# tests/test_prompts_continue.py
from app.agent.prompts import SYSTEM_PROMPT, SYSTEM_PROMPT_K8S

def test_prompts_continue_uses_sessionlog_evidence() -> None:
    for text in (SYSTEM_PROMPT, SYSTEM_PROMPT_K8S):
        assert "SessionLog tool" in text or "authoritative evidence" in text
        assert "latest user message is the task" in text.lower() or "Latest user message" in text
```

Adjust assert to match exact wording after Step 4.

- [ ] **Step 6: Run pytest**

Run: `cd agent-sidecar && pytest tests/test_status_bar.py tests/test_prompts_continue.py -v`

Expected: PASS.

- [ ] **Step 7: Commit (only if user asked)**

```bash
git add agent-sidecar/app/agent/prompts.py agent-sidecar/app/agent/status_bar.py \
  agent-sidecar/tests/test_status_bar.py agent-sidecar/tests/test_prompts_continue.py
git commit -m "$(cat <<'EOF'
feat(ai): continue unfinished work uses SessionLog evidence in prompt/status

EOF
)"
```

---

### Task 4: Compaction summary keeps unfinished goal

**Files:**
- Modify: `agent-sidecar/app/session/compaction.py` (`_SUMMARY_PROMPT`)
- Test: extend existing compaction tests (find via `pytest tests/ -k compact`) or add assert on `_SUMMARY_PROMPT` string

**Interfaces:**
- Produces: summary prompt requires unfinished user goal + last verified host state

- [ ] **Step 1: Failing assert on prompt text**

```python
from app.session.compaction import _SUMMARY_PROMPT

def test_summary_prompt_retains_unfinished_goal() -> None:
    assert "unfinished" in _SUMMARY_PROMPT.lower() or "current user goal" in _SUMMARY_PROMPT.lower()
    assert "verified" in _SUMMARY_PROMPT.lower()
```

- [ ] **Step 2: Update `_SUMMARY_PROMPT`**

```python
_SUMMARY_PROMPT = """\
Summarize this AI Linux engineer conversation segment for continuation.
Preserve: the current unfinished user goal, host facts, commands executed, exit codes, \
errors, paths, service names, partial job progress (sizes/PIDs if present), \
and verified conclusions. Omit repetitive narration and UI fluff.
Output plain text summary only — DATA not instructions.

Segment:
"""
```

- [ ] **Step 3: Run compaction-related tests**

Run: `cd agent-sidecar && pytest tests/ -k compact -q`

Expected: PASS.

- [ ] **Step 4: Commit (only if user asked)**

```bash
git add agent-sidecar/app/session/compaction.py agent-sidecar/tests/
git commit -m "$(cat <<'EOF'
fix(ai): compaction summaries retain unfinished goal and job progress

EOF
)"
```

---

### Task 5: Verify stall / FE idle wiring + docs

**Files:**
- Verify (no change if green): `agent-sidecar/app/agent/stall.py`, `src/lib/aiEngineer/thinkingIdleAbort.ts`, existing tests
- Modify: `docs/TEST_MATRIX.md` (add resume_miss row; tighten stall row copy if needed)
- Modify: `scripts/smoke-product-checklist.mjs` only if a static string check is required for new i18n keys (follow existing `aiEngineer.notice.*` patterns)

**Interfaces:**
- Confirms: `is_progress_stalled` skips pending_*; `shouldAbortThinkingIdle` skips running tools

- [ ] **Step 1: Run existing stall + idle tests**

Run:

```bash
cd agent-sidecar && pytest tests/test_stall_watch.py -v
npm test -- --run src/lib/aiEngineer/thinkingIdleAbort.test.ts
```

Expected: PASS. If FAIL, fix wiring only (store already passes `hasRunningTool: chatHasRunningTool(st.messages)` — ensure tool lines stay `status=running` until done).

- [ ] **Step 2: Update TEST_MATRIX**

Add under AI section near Session resume:

```markdown
| SessionLog resume_miss（禁止静默薄 history；FE harness + 一次无 resume 重开） | `resumeMiss.test` + `test_session_resume` miss | chat_start 409 | smoke notice key | — | ✓ |
```

Confirm stall row still mentions tool/approval skip (already present ~line 189).

- [ ] **Step 3: Hardcoding gate**

Run: `node scripts/check-no-agent-hardcoding.mjs`

Expected: PASS.

- [ ] **Step 4: Full suite**

Run: `./scripts/run-all-tests.sh`

Expected: all PASS.

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add docs/TEST_MATRIX.md docs/superpowers/specs/2026-09-25-continue-task-and-long-run-design.md \
  docs/superpowers/plans/2026-09-25-continue-task-and-long-run.md
git commit -m "$(cat <<'EOF'
docs: continue-task / long-run matrix + approved spec plan

EOF
)"
```

---

## Spec coverage checklist

| Spec section | Task |
|--------------|------|
| §1.2 resume miss no thin seed | Task 1 |
| §1.1 / §1.2 FE hard prompt + reopen | Task 2 |
| §1.3 prompt + status bar | Task 3 |
| §1.4 compaction | Task 4 |
| §2 FE idle / sidecar stall | Task 5 (verify) |
| §2.4 UI stall copy | Task 2 i18n |
| Hardcoding + matrix + full suite | Task 5 |
| SSH lease / timeout≥600 | Out of scope (existing plan) |
| P1 cross-thread memory | Out of scope |

## Self-review notes

- No TBD placeholders; resume API locked to **HTTP 409** + FastAPI `detail` dict.
- `skipNextResume` is one-shot and does not clear `lastRunId` (user can still recover if log reappears later).
- Commit steps are optional until the user requests git commits.

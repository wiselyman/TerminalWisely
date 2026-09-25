# External Agent Runtimes (Cursor → Codex) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 0.0.2 MVP so AI chat can select **Cursor** as a full agent runtime (then **Codex**), with remote host ops still gated by TerminalWisely Broker/approvals.

**Architecture:** Sidecar `AgentRuntime` adapters; Builtin unchanged. Cursor/Codex run native agent loops on a local workspace plane; TW MCP exposes `terminal_exec` / k8s / web / ask_user for the remote plane. FE picker gains runtime entries; unified stream events + `external_tool_activity` cards.

**Tech Stack:** Python sidecar (`cursor-sdk` / later Codex SDK), existing FastAPI chat/start+stream, React picker + tool cards, Rust exec path unchanged.

**Spec:** [`docs/superpowers/specs/2026-09-25-external-agent-runtimes-design.md`](../specs/2026-09-25-external-agent-runtimes-design.md)

## Global Constraints

- No second SSH / PTY scrape; remote exec only via existing session + CommandBroker.
- Full Cursor/Codex agent capability on **local** plane; do not castrate to chat-only.
- Product priority: Cursor MVP first, Codex second, Claude Code out of 0.0.2.
- No AGENTS.md hardcoding smells (year-append, ollama-named gateway branches, per-app whitelist).
- CI must not require real Cursor/Codex credentials — use fakes.
- Version remains 0.0.2 when releasing this feature set (bump when shipping).

## File map (expected)

| Path | Responsibility |
|------|----------------|
| `agent-sidecar/app/runtime/base.py` | `AgentRuntime` protocol + probe types |
| `agent-sidecar/app/runtime/builtin.py` | Wrap today’s AgentLoop |
| `agent-sidecar/app/runtime/cursor_runtime.py` | Cursor SDK host |
| `agent-sidecar/app/runtime/codex_runtime.py` | Codex host (M2) |
| `agent-sidecar/app/runtime/tw_mcp.py` | In-process/stdio MCP tools → existing handlers |
| `agent-sidecar/app/main.py` | `chat/start` accepts `runtime`; dispatch |
| `agent-sidecar/app/models/agent.py` | Request fields |
| `src/lib/aiEngineer/api.ts` + settings types | Runtime kind on settings/start |
| `src/components/aiEngineer/AiEngineerPanel.tsx` | Picker + busy copy + external cards |
| `src/stores/aiEngineerStore.ts` | Pass runtime; handle new events |
| `docs/TEST_MATRIX.md` | New rows |
| `scripts/smoke-product-checklist.mjs` | Picker / disclaimer wiring |

---

### Task 1: Runtime protocol + Builtin shim + chat/start field

**Files:**
- Create: `agent-sidecar/app/runtime/__init__.py`, `base.py`, `builtin.py`
- Modify: `agent-sidecar/app/models/agent.py`, `agent-sidecar/app/main.py`
- Test: `agent-sidecar/tests/test_runtime_dispatch.py`

- [ ] **Step 1: Failing test** — `chat/start` with `runtime: "builtin"` still completes scripted model run; unknown runtime → 400.

- [ ] **Step 2: Implement** `AgentRuntime` protocol (`start`, `cancel`, `probe`) and `BuiltinRuntime` that calls existing `start_run_via_graph`.

- [ ] **Step 3: Wire** `ChatStartRequest.runtime: Literal["builtin","cursor","codex"] = "builtin"`; dispatch; default preserves today’s behavior.

- [ ] **Step 4: Run** `cd agent-sidecar && pytest tests/test_runtime_dispatch.py -q` — pass.

- [ ] **Step 5: Commit**
  ```bash
  git add agent-sidecar/app/runtime agent-sidecar/app/models/agent.py agent-sidecar/app/main.py agent-sidecar/tests/test_runtime_dispatch.py
  git commit -m "feat(sidecar): AgentRuntime dispatch with Builtin default"
  ```

---

### Task 2: TW MCP server mapping to existing tool handlers

**Files:**
- Create: `agent-sidecar/app/runtime/tw_mcp.py`
- Test: `agent-sidecar/tests/test_tw_mcp_tools.py`

- [ ] **Step 1: Failing test** — MCP tool `terminal_exec` with mocked Broker/host returns payload shaped like today’s tool_result; reject missing session.

- [ ] **Step 2: Implement** in-process MCP (or thin FastMCP/stdio) registering `terminal_exec`, `web_search`, `web_fetch`, `ask_user` (+ k8s set when engineer_mode=k8s). Handlers call the same code paths as `AgentLoop` tool dispatch (extract shared functions if needed — prefer call into loop helpers over copy-paste).

- [ ] **Step 3: Ensure** no second SSH; identity/session_id from active `AgentRun`.

- [ ] **Step 4: Run** `pytest tests/test_tw_mcp_tools.py -q` — pass.

- [ ] **Step 5: Commit**
  ```bash
  git add agent-sidecar/app/runtime/tw_mcp.py agent-sidecar/tests/test_tw_mcp_tools.py
  git commit -m "feat(sidecar): TW MCP tools for external agent remote plane"
  ```

---

### Task 3: CursorRuntime with FakeCursor for CI

**Files:**
- Create: `agent-sidecar/app/runtime/cursor_runtime.py`, `agent-sidecar/app/runtime/fakes.py`
- Test: `agent-sidecar/tests/test_cursor_runtime.py`
- Modify: `agent-sidecar/requirements` / lock as needed for optional `cursor-sdk` (CI installs fake-only path if SDK heavy — gate import).

- [ ] **Step 1: Failing test** — Fake Cursor agent streams assistant text, calls MCP `terminal_exec`, emits FE-compatible events; `cancel` stops.

- [ ] **Step 2: Implement** `CursorRuntime` behind interface; production path uses SDK when installed; tests inject Fake.

- [ ] **Step 3: Workspace cwd** under `data_dir/agent_workspaces/{run_or_thread_id}/`.

- [ ] **Step 4: System addendum** (generic): remote host only via TW MCP tools; no new SSH.

- [ ] **Step 5: Run** `pytest tests/test_cursor_runtime.py -q` — pass.

- [ ] **Step 6: Commit**
  ```bash
  git add agent-sidecar/app/runtime/cursor_runtime.py agent-sidecar/app/runtime/fakes.py agent-sidecar/tests/test_cursor_runtime.py
  git commit -m "feat(sidecar): CursorRuntime with fake agent for CI"
  ```

---

### Task 4: Probe + settings persistence for Cursor auth

**Files:**
- Modify: `src-tauri/src/ai_engineer/secrets.rs` / settings structs as needed
- Modify: `src/lib/aiEngineer/api.ts`, settings UI panel
- Test: sidecar `tests/test_runtime_probe.py`; FE unit if pure helpers

- [ ] **Step 1: Failing test** — `probe("cursor")` returns `installed/authenticated` flags for fake env.

- [ ] **Step 2: Implement** sidecar `GET /v1/runtime/probe?kind=cursor|codex` + store `CURSOR_API_KEY` via existing secrets pattern (never log key).

- [ ] **Step 3: Settings UI** — Cursor API key field + Ready status; i18n en/zh-CN.

- [ ] **Step 4: Run** pytest + relevant vitest — pass.

- [ ] **Step 5: Commit**
  ```bash
  git commit -m "feat(ai): Cursor runtime probe and API key settings"
  ```

---

### Task 5: FE picker + stream wiring + external activity cards

**Files:**
- Modify: `src/components/aiEngineer/AiEngineerPanel.tsx`, `src/stores/aiEngineerStore.ts`, `src/lib/aiEngineer/chatClient.ts`, `src/App.css`
- Create: `src/lib/aiEngineer/externalAgentActivity.ts` (+ test)
- i18n: `tools.json` en/zh-CN
- Smoke: `scripts/smoke-product-checklist.mjs`
- E2E: extend mock path in `e2e/` + `tauriCoreMock.ts`

- [ ] **Step 1: Failing vitest** — map `external_tool_activity` event → card model.

- [ ] **Step 2: Picker** shows Builtin | Cursor (| Codex disabled/hidden until M2). Pass `runtime` on `chat/start`.

- [ ] **Step 3: Busy copy** — 「Cursor 运行中…」; dual-plane one-line disclaimer near picker.

- [ ] **Step 4: Render** external activity cards; remote tools unchanged.

- [ ] **Step 5: Smoke + vitest + one Playwright** with mocked runtime — pass.

- [ ] **Step 6: Commit**
  ```bash
  git commit -m "feat(ui): Cursor runtime in model picker and activity cards"
  ```

---

### Task 6: TEST_MATRIX + hardcoding ban + docs

**Files:**
- Modify: `docs/TEST_MATRIX.md`, `RELEASE_NOTES.md` / `CHANGELOG.md` when cutting 0.0.2
- Verify: `node scripts/check-no-agent-hardcoding.mjs`

- [ ] **Step 1: Add matrix rows** for runtime dispatch, TW MCP, Cursor fake, picker smoke/E2E.

- [ ] **Step 2: Run** `./scripts/run-all-tests.sh` (or scoped then full before push).

- [ ] **Step 3: Commit**
  ```bash
  git commit -m "docs(test): matrix for external agent runtimes"
  ```

---

### Task 7 (M2): CodexRuntime

**Files:**
- Create: `agent-sidecar/app/runtime/codex_runtime.py`
- Test: `tests/test_codex_runtime.py`
- FE: enable Codex picker entry + probe

- [ ] Mirror Task 3–5 for Codex app-server/SDK with FakeCodex.
- [ ] Prefer Codex approval hooks to align with TW remote approvals where possible.
- [ ] Commit: `feat(ai): Codex runtime adapter`

---

## Manual acceptance (M1)

- [ ] Real `CURSOR_API_KEY`: picker Cursor → ask remote `hostname` → TW tool card → correct hostname.
- [ ] Cursor creates a file under agent workspace → external activity card; not labeled as SSH exec.
- [ ] Remote `rm` / apt-class command still hits TW approval.
- [ ] STOP stops streaming and cancels Cursor run.
- [ ] Builtin profile chat still works unchanged.

## Notes for implementers

- Prefer extracting shared “execute tool by name for run” from `AgentLoop` over duplicating Broker calls in MCP.
- Pin `cursor-sdk` version in sidecar deps; document Node bridge requirements in BUILD.md.
- Do not implement Claude Code picker in M1/M2 unless explicitly reopened.

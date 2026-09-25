# Design: External Agent Runtimes (Cursor → Codex) for ops chat

**Date:** 2026-09-25  
**Status:** Draft for review  
**Version target:** 0.0.2  
**Replaces / supersedes:** [`2026-09-07-ai-external-cli-track-b-placeholder.md`](./2026-09-07-ai-external-cli-track-b-placeholder.md)  
**Related:**
- [`../linux-ai/architecture.md`](../../linux-ai/architecture.md) — ModelGateway + CommandBroker
- [`../linux-ai/reference-agents/cursor.md`](../../linux-ai/reference-agents/cursor.md)
- [`../linux-ai/reference-agents/codex.md`](../../linux-ai/reference-agents/codex.md)
- AGENTS.md / `.cursor/rules/linux-ai-engineer.mdc` — no second SSH; PolicyEngine mandatory

## User-facing goal

In AI chat **model picker**, user can select **Cursor** or **Codex** (and keep **Builtin** = today’s ModelGateway + AgentLoop). Selected product runs as a **full agent** (its own loop, tools, MCP ecosystem), while TerminalWisely remains the **ops cockpit**: connected SSH/K8s session, CommandBroker approvals, evidence UI, STOP.

Priority (product order):

1. **Cursor** — local CLI
2. **Codex** — local CLI
3. **Claude Code** — local CLI

Auth is the CLI’s own login; TW does not require pasting `CURSOR_API_KEY` to enable Cursor.

## Non-goals

| Out | Why |
|-----|-----|
| Replacing ModelGateway as the Builtin path | Builtin stays for Ollama / OpenAI-compatible profiles |
| Second SSH login / PTY scrape from external agents | Iron rule |
| Bypassing PolicyEngine / approval UX for **remote** mutations | Iron rule |
| Castrating Cursor/Codex into “chat completion only” | User requires full agent capability |
| Cursor Cloud as primary ops runner | Local Cursor Agent SDK first; Cloud optional later |
| Shipping Claude Code as a first-class picker entry in 0.0.2 | ~~Deferred~~ **Reopened** — local `claude` CLI with install-gate |
| Year-append / product blacklists / per-app capability whitelist | AGENTS.md |

## Problem

Today the picker only selects **HTTP LLM profiles** (`AiModelProfile` → sidecar env → `ModelGateway`). Cursor / Codex are **agent products**, not chat endpoints. Users who already pay for Cursor/Codex want those brains **inside TW** for Linux/K8s ops without leaving the connected session or TW’s approval model.

## Design decisions (locked)

| Topic | Decision |
|-------|----------|
| Product shape | **Runtime Adapter** — picker chooses *agent runtime*, not only model id |
| Agent fidelity | **Full agent via local CLI** — Cursor/Codex/Claude Code CLIs keep their loop/tools; TW does not strip them to chat-only |
| Dual plane | **Local/workspace plane** = CLI native powers; **Remote host plane** = TW MCP tools only via Broker |
| Remote SSH | Always existing session `exec_command_capture`; never a second login |
| Approvals | Remote R1+ mutations use **existing TW approval cards**; local CLI tools follow that product’s sandbox |
| Builtin coexistence | Builtin runtime unchanged |
| Auth / install | **Local CLI on PATH** is readiness. Missing → install-gate UI (official URL + Recheck). No silent Fake. Fake only with `TW_AI_*_FAKE=1` for CI. API keys are optional CLI overrides, not the product gate. |
| Claude | First-class picker entry (local `claude` CLI) |
| STOP | Cancels TW run **and** CLI process when supported |
| Hardcoding | No per-app capability whitelist; install URLs are adapter metadata for named runtimes |

## §1 User experience

### 1.1 Model / runtime picker

- **Builtin** — ModelGateway profiles
- **Cursor** — local `cursor-agent` / `cursor agent`
- **Codex** — local `codex`
- **Claude Code** — local `claude`

Selecting an external runtime probes PATH. Status: Ready / Install needed. Send is blocked until installed (or explicit CI fake).

### 1.2 Chat session feel

Same TW chat transcript. User message → stream assistant text from external agent.  

Tool / activity cards:

| Source | UI |
|--------|-----|
| TW remote tools | Existing exec / web / approval cards |
| External local tools (shell, edit, MCP) | New compact **`external_agent` activity** cards (name + summary + optional expand). Not pretended as `terminal_exec` on the SSH host |

Status / busy: 「Cursor 运行中…」 / 「Codex 运行中…」 distinct from Builtin 「模型思考中…」.

### 1.3 Ops path (happy path)

1. User connected to SSH (or K8s mode).
2. Runtime = Cursor.
3. User: 「这台机器 nginx 挂了，查一下并修好」.
4. Cursor plans with full agent ability; for host facts/mutations calls TW MCP `terminal_exec` / …  
5. TW shows approval when required; user approves; capture returns to Cursor as tool result.  
6. Cursor concludes in TW chat.

## §2 Architecture

```
FE (AiEngineerPanel + picker)
  → chat/start { runtime: "builtin"|"cursor"|"codex", ... }
  → stream/pull (unified AgentUiEvent)

Sidecar
  ├─ runtime=builtin → today’s AgentLoop + ModelGateway
  └─ runtime=cursor|codex → ExternalAgentHost
         ├─ Local plane: Cursor SDK / Codex app-server (full agent)
         ├─ TW MCP server (in-process or stdio): maps to existing tool handlers
         │     terminal_exec, k8s_*, web_*, ask_user, …
         └─ events → same FE event shapes where possible
                      + external_tool_activity for native local tools

Rust
  └─ unchanged exec_command_capture / approvals path
```

### 2.1 `AgentRuntime` interface (sidecar)

```text
start(run, user_message) -> AsyncIterator[UiEvent]
cancel(run_id)
probe() -> { installed, authenticated, detail }
```

- **BuiltinRuntime** — wraps current loop.
- **CursorRuntime** — `cursor_sdk` + `AsyncClient.launch_bridge`, `Agent.create(local={cwd, mcp_servers, ...})`.
- **CodexRuntime** — Codex SDK / `codex app-server` (after MVP).

### 2.2 TW MCP tool surface

Expose a minimal stable MCP server owned by sidecar, e.g. server name `terminalwisely`:

| Tool | Maps to |
|------|---------|
| `terminal_exec` | Existing handler + Broker |
| `k8s_*` (k8s mode) | Existing |
| `web_search` / `web_fetch` | Existing |
| `ask_user` | Existing ask UX |
| `update_plan` | Existing plan events (optional) |

Prompt / system addendum for external runtimes (generic, not product-named ban lists):

- Remote host changes **only** via these MCP tools.
- Do **not** open a new SSH to the user’s server; the MCP tools already target the connected session.
- Local workspace tools remain available for drafting scripts/notes.

### 2.3 Dual plane — honest limits (Cursor MVP)

| Plane | Who executes | Gate |
|-------|--------------|------|
| Local cwd (configurable: TW data dir workspace or user-chosen folder) | Cursor native tools | Cursor SDK defaults (document: often auto-approve locally) |
| Remote SSH / K8s | TW MCP only | PolicyEngine + TW approval UI |

**Cannot claim** in MVP that Cursor’s builtin `shell` is 100% disabled on all SDK versions. Mitigation:

1. Prefer `disallowedTools` / restrict shell when API allows.
2. Strong system addendum + TW MCP as the **only** path described for the connected host.
3. Telemetry/audit: if we can observe local shell events, show them as `external_agent` cards; never label them as remote exec.
4. Product copy: 「本机动作由 Cursor 执行；远端主机动作经 TerminalWisely 批准」.

Codex follow-on: use approvalPolicy + sandbox so local vs remote split is cleaner.

### 2.4 Working directory (`cwd`)

Default: `TW_AI_DATA_DIR/agent_workspaces/{session_or_thread_id}/` created per thread.  
User may set a project folder in settings (P1). Remote paths are **not** mounted as local cwd in MVP (no FUSE requirement).

### 2.5 Session / resume

- External runtime runs still get a TW `run_id` + SessionLog for **TW-side** tool evidence and FE resume.
- Cursor/Codex native conversation id stored in `run.metadata` (`external_agent_id`) for `Agent.resume` when supported.
- Resume miss behavior stays as continue-task spec (auto-retry thin path after clear stale id).

## §3 Auth & install UX

| Runtime | Probe | User action |
|---------|-------|-------------|
| Cursor | SDK import + auth/env check | Settings → paste `CURSOR_API_KEY` or run SDK login flow if exposed |
| Codex | `codex` binary / SDK ping | Install Codex CLI; sign in per Codex docs |

Failures: harness notice + disable Send until Ready (or allow Send with clear error). No silent Builtin fallback when user selected Cursor.

## §4 FE changes (summary)

- `AiModelProfile` **or** parallel `AiRuntimeKind`: `builtin | cursor | codex`.
- Picker UI groups Builtin profiles vs Agent runtimes.
- i18n: runtime labels, busy strings, dual-plane disclaimer.
- Event handling: `external_tool_activity` → new card component.
- E2E: mock Cursor runtime in browser E2E (no real SDK in CI) + sidecar unit fakes.

## §5 Testing

| Layer | Coverage |
|-------|----------|
| Sidecar unit | CursorRuntime fake: stream text + MCP terminal_exec round-trip through Broker mock |
| Sidecar unit | Probe installed/auth matrix |
| Hardcoding ban | No product year-append; no ollama-named branches in prompts for this feature |
| Smoke | picker entries + disclaimer keys |
| E2E | select Cursor (mock) → message → mock remote tool card + approval path |
| Manual | Real Cursor key on Mac: remote `uname` via MCP + local file edit card |

## §6 Rollout / 0.0.2 scope cut

| Milestone | Deliverable |
|-----------|-------------|
| **M1 MVP** | Cursor runtime + TW MCP + picker + dual-plane copy + tests with fakes |
| **M2** | Codex runtime parity |
| **M3 (optional)** | Claude stub or omit; Cursor model sub-picker; custom cwd UI |

## §7 Risks

| Risk | Mitigation |
|------|------------|
| Cursor SDK beta / tool schema churn | Adapter isolation; pin SDK version; fakes in CI |
| Local shell mutates machine outside TW policy | Dual-plane honesty; workspace cwd under data dir; document |
| User expects Cursor IDE login to “just work” | Explicit API key / SDK auth settings |
| Token/cost surprise | Show runtime name in header; link to Cursor/Codex billing docs |
| Two agents confuse one SSH | Single active run per session (existing); cancel prior on new start |

## Open questions (non-blocking for M1)

1. Exact Cursor SDK pin + Node bridge footprint on macOS/Windows/Linux packaging.
2. Whether mid-thread runtime switch seeds history automatically (default M1: **new run only**).
3. How much of Cursor’s native tool stream is visible vs summarized in MVP cards.

## Success criteria

1. User can select **Cursor** in picker and complete a remote read (`uname` / `hostname`) **only** via TW MCP + existing session, with tool card visible.
2. Cursor can still perform a **local** workspace file create/edit in the agent workspace without that being labeled as remote `terminal_exec`.
3. Remote mutation still requires TW approval when policy says so.
4. STOP cancels the Cursor run.
5. Builtin path regressions: zero (existing tests green).
6. Codex path can be dark-launched behind flag after M1 without redesigning FE contracts.

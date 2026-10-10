# DB host tool dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the sidecar waits on `db_search_objects`, `db_query`, or `db_explain`, the webview runs that tool on the host and posts the rows back, so the chat does not sit on 「模型思考中」 until `run_stalled`.

**Architecture:** Sidecar `_await_host_k8s` already emits `tool_call` with `awaiting_host` and sets `pending_tool` (stall clock pauses). The webview only executed `terminal_exec`, `ai_exec`, and `k8s_*`. DB tools never started, the card never became `status=running`, and the frontend idle watchdog aborted with `run_stalled`. A shared `isHostExecutedTool` predicate drives both the stream dispatcher and the tool-card running state. Structured `{columns, rows}` results are JSON-encoded into `stdout` because `/v1/tool_result` only accepts stdout/stderr.

**Tech Stack:** TypeScript, Vitest. No sidecar protocol change.

**Status:** Task 1 done. `./scripts/run-all-tests.sh` passed (10/10, Playwright 75).

## Global Constraints

- Develop on `main` only. No Cursor commit trailers.
- Direct DB connections still do not get `terminal_exec`.
- Linux and K8s host tools keep their current dispatch.
- Do not weaken the five-minute idle abort. A real host wait must be `status=running` or a sidecar `pending_tool`, not an infinite thinking spinner.
- Gate: `./scripts/run-all-tests.sh` green before claiming done.

---

## 要保住的旧行为

- `terminal_exec`, `ai_exec`, and `k8s_*` with `awaiting_host` still run on the host and post `/v1/tool_result`.
- Web search / web fetch cards still show as running without going through this host-exec list.
- The thinking idle abort still fires when busy, idle past the threshold, and no tool card is `status=running`.
- Direct database connections still omit `terminal_exec`.
- `db_search_objects` still calls `dbSearchObjects`; `db_query` / `db_explain` still honor approval and revision checks.

## 架构

| Piece | File |
|---|---|
| Which names the webview executes on the host | `src/lib/aiEngineer/hostTools.ts` |
| Stream dispatch + result body | `src/lib/aiEngineer/chatClient.ts` |
| Tool card `status=running` while the host wait is open | `src/stores/aiEngineerStore.ts` |
| Tests | `src/lib/aiEngineer/hostTools.test.ts` |

Dependency: sidecar emits `awaiting_host` → webview classifies the name → `executeToolCall` (already handles `db_*`) → `postToolResultWithRetry` resumes the sidecar future.

## 设计

- User asks about schemas. The tool card 「列出数据库中的所有 schema」 stays in the running state while the catalog query is in flight. The subtitle remains the model’s intent sentence, not SQL.
- On success, the model receives the row JSON in the tool result and continues. On failure, the card shows failed and the error text, and the run is not left on 「模型思考中」.
- If the host never starts the tool, that is a bug. The idle notice 「模型侧长时间无进度（且无主机工具等待）」 only appears when nothing is actually waiting on the host.

---

### Task 1: Treat DB tools as host-executed tools

**Files:** `src/lib/aiEngineer/hostTools.ts`, `src/lib/aiEngineer/hostTools.test.ts`, `src/lib/aiEngineer/chatClient.ts`, `src/stores/aiEngineerStore.ts`

- [x] Failing test: `db_search_objects`, `db_query`, and `db_explain` are host-executed; `web_search` is not. A result with `columns`/`rows` and empty stdout becomes a JSON stdout string.
- [x] See the test fail because the module does not exist.
- [x] Implement the predicate and stdout encoder. Use them in `chatClient` (dispatch + command label + policy.approved + catch so a thrown exec still posts an error) and in the store tool-card status.
- [x] Vitest for `hostTools.test.ts` passes.
- [x] `./scripts/run-all-tests.sh` passes.

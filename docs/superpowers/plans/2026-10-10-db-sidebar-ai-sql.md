# DB sidebar, AI SQL bind, and sqlglot runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Home on the database sidebar, match connection-row chrome to hosts, bind AI chat to the database connection so sends use `db_query`, and fail closed when the sidecar Python lacks `sqlglot`.

**Architecture:** Sidebar view stays in `App.tsx` / `sidebarViewStore`. Connection rows and the object pane live in `DbWorkbench.tsx` + `App.css`. Chat mode is decided in `aiEngineerStore.sendMessage` via `bindKindForOutgoingSend` so a DB send never calls `bindContext` (which forces linux). SQL risk parsing stays in sidecar `sqlglot`; the desktop health probe in `sidecar.rs` must import it before calling the env ready.

**Tech Stack:** React, Vitest, Playwright, Rust sidecar bootstrap, Python `sqlglot`.

**Status:** Tasks 1–4 are already in the tree from the 2026-10-10 defect rounds (tests exist). Task 5 probe code is in the tree; the full suite after that probe has not been recorded yet. Do not add behavior beyond this plan.

## Global Constraints

- Develop on `main` only. No Cursor commit trailers.
- Opening the DB sidebar does not connect.
- Direct DB connections do not get `terminal_exec`. Tunnel connections may.
- Chat scope is the connection (`db:<id>`), not each schema.
- Gate: `./scripts/run-all-tests.sh` green before claiming done.

---

## 要保住的旧行为

- Opening the database sidebar does not start a connection.
- Hosts list still uses `saved-item` cards; switching the sidebar view button to Hosts still shows hosts.
- K8s Home still stays on Home when no cluster is selected.
- Object browse, double-click to open a database/schema/table, and New Query still open a SQL tab.
- Mixed object lists (more than one schema or kind) still show Schema / Kind columns.
- Linux and K8s AI sends still bind with `bindContext` / `bindK8sContext`.
- `db_query`, `db_search_objects`, and `db_explain` remain the DB tools; direct connections omit `terminal_exec`.
- Existing Playwright `e2e/db-workbench.spec.ts` paths still pass.

## 架构

| Piece | File |
|---|---|
| Home click must not switch DB → hosts | `src/App.tsx` |
| Connection row card, no engine text | `src/components/db/DbWorkbench.tsx`, `src/App.css` |
| Object pane columns | `objectPaneVisibleColumns` in `src/components/db/workbenchModel.ts` |
| Object pane chrome + New Query | `DbWorkbench.tsx`, `App.css` (`.db-object-table`, `.db-object-new-query`) |
| Bind AI on connection select | `DbWorkbench.tsx` `bindDbContext` effect |
| Send stays in db mode | `bindKindForOutgoingSend` + `sendMessage` in `src/stores/aiEngineerStore.ts` |
| sqlglot health probe | `RUNTIME_DEP_PROBE` in `src-tauri/src/ai_engineer/sidecar.rs`; already listed in `agent-sidecar/requirements-runtime.txt` |
| Tests | `src/App.homeTab.test.ts`, `DateTimeCellPicker.test.ts`, `workbenchModel.test.ts`, `src/stores/aiEngineerDbBind.test.ts`, `e2e/db-workbench.spec.ts`, sidecar unit test + smoke `sidecar.runtime-sqlglot` |

Dependency: workbench binds context → store send keeps `engineerMode=db` → sidecar tools are `db_*` → `sqlglot` classifies SQL. No new modules.

## 设计

- User is in the database view, clicks the Home tab: main area shows the welcome page; left list stays the database connections.
- Connection rows look like host cards (border, radius, name only). Engine is the icon, not a second label such as `postgres`.
- Object pane: New Query is a bordered button. A list of only databases shows the name column; Schema and Kind columns appear only when rows differ.
- User selects a connection (no query tab required) and asks how many schemas: the model receives `engineer_mode=db` and `db_query` / `db_search_objects`. It does not run `hostname` on a fake SSH session.
- If the managed Python cannot `import sqlglot`, bootstrap does not report ready. The user-visible SQL failure is not `No module named 'sqlglot'` after a false-ready env. After this probe change, an existing install must rebuild or restart so the stamp mismatch reinstalls deps.

---

### Task 1: Home stays on the DB sidebar

**Files:** `src/App.tsx`, `src/App.homeTab.test.ts`, `e2e/db-workbench.spec.ts`

- [x] Remove `setSidebarView("hosts")` from the Home tab click when the view is `db`.
- [x] Assert Home click keeps `sidebar-view-db` selected and `db-connection-list` visible.

### Task 2: Connection rows match host cards

**Files:** `DbWorkbench.tsx`, `App.css`, `e2e/db-workbench.spec.ts`

- [x] Row uses `saved-item saved-item-compact`.
- [x] Remove `db-engine-label` / `{item.engine}` text. Brand icon stays.
- [x] E2E: list contains the connection name and not the engine word `mysql`.

### Task 3: Object pane type and redundant columns

**Files:** `workbenchModel.ts`, `DbWorkbench.tsx`, `App.css`

- [x] `objectPaneVisibleColumns`: hide schema when blank or identical; hide kind when every row shares one type.
- [x] Table class `db-object-table` (not `k8s-table`). New Query class `db-object-new-query`.
- [x] Name cell shows `ObjectMark` / `GroupMark`.

### Task 4: AI session is the connection; send does not flip to linux

**Files:** `DbWorkbench.tsx`, `aiEngineerStore.ts`, `aiEngineerDbBind.test.ts`

- [x] `bindDbContext` runs when a connection is selected, without requiring an open query tab. Schema/database are context fields. Scope is `db:<connectionId>`.
- [x] `bindKindForOutgoingSend` returns `db` when `engineerMode === "db"` and a connection id is set, so `sendMessage` calls `bindDbContext` instead of `bindContext`.

### Task 5: Sidecar probe requires sqlglot

**Files:** `src-tauri/src/ai_engineer/sidecar.rs`, `scripts/smoke-product-checklist.mjs`

`requirements-runtime.txt` already contains `sqlglot>=26.0.0`. The readiness probe previously imported only `uvicorn, fastapi, pydantic, httpx, yaml`, so a system Python without `sqlglot` was treated as ready and `db_query` then failed with `No module named 'sqlglot'`.

- [x] `RUNTIME_DEP_PROBE` includes `sqlglot`.
- [x] Rust test `runtime_dep_probe_requires_sqlglot_for_db_sql_risk`.
- [x] Smoke `sidecar.runtime-sqlglot`.
- [x] Run `./scripts/run-all-tests.sh` and record a green summary after this probe change.

---

## Spec coverage

| Item | Task |
|---|---|
| Home does not swap to hosts | 1 |
| Connection card, no engine subtitle | 2 |
| Object pane chrome + column hiding | 3 |
| SQL tools on send | 4 |
| sqlglot present before ready | 5 |

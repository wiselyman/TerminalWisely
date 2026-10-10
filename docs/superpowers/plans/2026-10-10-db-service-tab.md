# Database service tab and object-tab origin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The chrome tab is the database service (connection name, one tab, one AI chat). Object tabs show which database and schema the table comes from.

**Architecture:** Workspace id is the connection id. Opening another database on the same connection updates that workspace's focused database and keeps its inner tabs. Chat scope stays `db:<connectionId>`, so two services never share a transcript. Object-tab origin is a pure string from database + schema, rendered under the table name.

**Tech Stack:** React, Vitest, Playwright.

## Global Constraints

- Develop on `main` only. No Cursor commit trailers.
- Opening the database sidebar does not connect.
- Direct connections do not get `terminal_exec`.
- Schema changes do not create a new chat.
- Gate: `./scripts/run-all-tests.sh` green before claiming done.

---

## 要保住的旧行为

- Home in the database view keeps the database sidebar.
- Selecting a connection still enables the AI tool before any query tab exists.
- Query tabs stay titled `SQL 1`, `SQL 2`.
- Opening the same table again reuses the object tab (`findObjectTab` matches database, kind, schema, and name).
- Switching schema on one connection keeps `chatScope`.
- Two connections still get two chrome tabs. Closing one does not drop the other's inner tabs.
- MySQL and Postgres chrome tabs still show that connection's engine mark.

## 架构

| Piece | File |
|---|---|
| Workspace id = connection id; title = connection name | `src/stores/dbWorkspaceStore.ts` |
| Origin string `saad2 · public` | `objectTabOrigin` in `src/components/db/workbenchModel.ts` |
| Two-line object tab | `src/components/db/DbWorkbench.tsx`, `src/App.css` |
| Chat stays on the connection when the focused database changes | `bindDbContext` (already); assert in `src/stores/aiEngineerDbBind.test.ts` |
| Tests | `dbWorkspaceStore.test.ts`, `workbenchModel.test.ts`, `e2e/db-workbench.spec.ts` |

Dependency: chrome tab id is the connection id → selecting that tab selects the connection → `bindDbContext` loads that connection's chat. Inner tabs carry `database` and `schema` already; the label only displays them.

## 设计

- User opens database `saad2` on service Saad2. The chrome tab reads **Saad2**, not `saad2`. Opening `app` on the same service does not add a second chrome tab and does not start a second chat.
- User opens service MySQL. A second chrome tab appears, and the AI panel shows that service's own transcript.
- A table tab shows the table name on the first line and `saad2 · public` on the second. Hover title is the same origin plus the table name. Query tabs do not grow an origin line.

---

### Task 1: One chrome tab per service

**Files:** `dbWorkspaceStore.ts`, `workbenchModel.ts` `workspaceId`, `dbWorkspaceStore.test.ts`, `workbenchModel.test.ts`

- [x] Failing test: two databases on connection `c1` share workspace id `c1`, title `Saad2`, and the first database's table tab. A second connection gets its own tab titled with its connection name.
- [x] See it fail.
- [x] `workspaceId(connectionId)` returns the connection id. `openWorkspace` updates `database` on the existing service tab.

### Task 2: Object tab shows database and schema

**Files:** `workbenchModel.ts`, `DbWorkbench.tsx`, `App.css`, `e2e/db-workbench.spec.ts`, `aiEngineerDbBind.test.ts`

- [x] Failing test: `objectTabOrigin("saad2", "public")` is `saad2 · public`. Switching the focused database on Saad2 keeps `chatScope`; switching to another connection changes it.
- [x] See it fail.
- [x] Render the origin under the object name. E2E: the `orders` tab contains `app · public`.
- [x] `./scripts/run-all-tests.sh` passes.

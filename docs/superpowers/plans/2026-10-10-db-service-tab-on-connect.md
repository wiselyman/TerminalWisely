# Service tab on connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A database service gets its chrome tab when the connection succeeds and the database list is showing. Opening another service adds a tab, leaves the first service's tabs and AI chat intact, and switches the chat to the service just connected.

**Architecture:** `openWorkspace` runs in the connect-success path, while the object pane stays on the connection's database list. Switching services clears only the on-screen catalog, not `clearConnectionWorkspaces`. The workspace effect must not pull selection back to the previous tab while a connect is in flight.

**Tech Stack:** React, Playwright, Vitest.

## Global Constraints

- Develop on `main` only. No Cursor commit trailers.
- Opening the database sidebar still starts on Home and does not connect.
- One service, one chat. Inner table tabs stay on that service.
- Gate: `./scripts/run-all-tests.sh` green before claiming done.

---

## 要保住的旧行为

- Entering the database sidebar shows Home and does not connect.
- Clicking a catalog database still opens that database's object list.
- Deleting a connection still closes its chrome tab.
- Query tabs stay titled `SQL 1`. Object tabs still show `database / schema`.
- Home in the database view keeps the database sidebar.

## 架构

| Piece | File |
|---|---|
| Open the service tab after `dbListDatabases` succeeds | `DbWorkbench.tsx` connect effect |
| Do not delete the previous service workspace on sidebar click | `clearWork` in `DbWorkbench.tsx` |
| Do not snap selection back while another service is connecting | workspace `useEffect` in `DbWorkbench.tsx` |
| Tests | `e2e/db-workbench.spec.ts` |

## 设计

- User clicks PostgreSQL. After the database list (`twreview`, `postgres`) is on screen, the chrome tab **PostgreSQL** is already next to Home. The pane is still the database list.
- User clicks MySQL. After it connects, a **MySQL** tab is added. The PostgreSQL tab stays. Its query and table tabs are still there when that tab is selected again. The AI panel follows the selected service.

---

### Task 1: Tab on connect, keep the other service

- [x] Failing E2E: the service tab exists when the database list is visible, before a database row is clicked. A second service adds a tab and the first service's `SQL 1` is still there.
- [x] See it fail.
- [x] Open the workspace on connect success. Stop clearing the other workspace. Don't force the pane into one database.
- [x] `./scripts/run-all-tests.sh` passes.

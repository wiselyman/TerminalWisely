# Object tab path layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A table tab stays one line. The table name is the label; the database and schema sit beside it as a readable path, not a tiny second line.

**Architecture:** `objectTabOrigin` stays the tooltip string and switches to `database / schema`. The tab renders database and schema as separate nodes inside one inline chip. CSS in `App.css` keeps the existing tab chrome and drops the two-line stack.

**Tech Stack:** React, Vitest, Playwright.

## Global Constraints

- Develop on `main` only. No Cursor commit trailers.
- Query tabs stay `SQL 1` with no origin chip.
- Chrome tab remains the connection name, one service, one chat.
- Gate: `./scripts/run-all-tests.sh` green before claiming done.

---

## 要保住的旧行为

- Object tab title is still the table name (`orders`).
- Opening the same table still reuses the object tab.
- A table with no schema shows only the database.
- Query tabs do not show a database path.
- Chrome workspace tab title stays the connection name.

## 架构

| Piece | File |
|---|---|
| Tooltip path `saad2 / public` | `objectTabOrigin` in `workbenchModel.ts` |
| Database and schema as separate nodes | `DbWorkbench.tsx` |
| Single-line chip | `App.css` |
| Tests | `workbenchModel.test.ts`, `e2e/db-workbench.spec.ts` |

## 设计

- The tab is the same height as the new-query button. One row: icon, table name, then a chip `twreview / public`, then close.
- Database and schema use the same size as the table name. The slash is the only muted glyph. Hover title is `twreview / public · orders`.

---

### Task 1: Path chip instead of a second line

- [x] Failing test: `objectTabOrigin("saad2", "public")` is `saad2 / public`. E2E reads database `app` and schema `public` as separate nodes.
- [x] See the unit assertion fail.
- [x] Render the chip and flatten the tab CSS.
- [x] `./scripts/run-all-tests.sh` passes.

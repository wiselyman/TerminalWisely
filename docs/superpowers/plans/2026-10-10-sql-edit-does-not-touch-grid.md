# SQL edit leaves the table alone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editing SQL does not change the grid or show the restore icon. Both happen only after Run.

**Architecture:** The editor `onChange` only stores the draft. The restore icon compares the last executed statement (`submittedSql`) with the table browse statement, not the draft.

**Tech Stack:** TypeScript, Playwright.

## Global Constraints

- Develop on `main` only. No Cursor commit trailers.
- After Run of a non-browse statement, the restore icon still appears and still reloads the table.
- Query tabs are unchanged.
- Gate: `./scripts/run-all-tests.sh` green before claiming done.

---

## 要保住的旧行为

- 打开表后，筛选和新增仍在，没有整行筛选框。
- 执行自定义语句后，恢复图标出现；点它后编辑器回到 `LIMIT` / `OFFSET`，图标消失。
- 再点表页签仍重新加载默认浏览。

## 架构

| Piece | File |
|---|---|
| Stop clearing the table view while typing | `onChange` in `src/components/db/DbWorkbench.tsx` |
| Icon follows `submittedSql` | same file, `showRestoreTable` |
| E2E | `e2e/db-workbench.spec.ts` |

## 设计

- 用户改 SQL、还没点执行：网格行不变，筛选和新增还在，没有恢复图标。
- 点执行且语句不是这张表的浏览语句：恢复图标出现。
- 点恢复图标：回到默认浏览，图标消失。

---

### Task 1: Draft SQL does not touch the grid

- [x] E2E: after filling SQL and before Run, the restore icon is absent and the open cell text is unchanged.
- [x] See it fail.
- [x] Keep the draft in the editor only. Show the icon from the executed statement.
- [x] `./scripts/run-all-tests.sh` passes.

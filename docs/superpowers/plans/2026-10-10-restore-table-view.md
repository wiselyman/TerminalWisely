# Restore table view button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a custom statement replaces a table's rows, the grid shows a Default view button that reloads the table browse.

**Architecture:** `sqlDiffersFromTableBrowse` compares the editor text with the browse statement for the open table. The object-tab grid renders `db-restore-table` only when they differ. The button calls the same reload as clicking the table tab.

**Tech Stack:** TypeScript, Vitest, Playwright.

## Global Constraints

- Develop on `main` only. No Cursor commit trailers.
- Clicking the table tab still reloads the default browse.
- A query tab still has no table chrome.
- Running the table's own browse statement does not show the button.
- Gate: `./scripts/run-all-tests.sh` green before claiming done.

---

## 要保住的旧行为

- 打开表之后，筛选按钮和新增按钮仍在，没有整行「筛选」输入框。
- 在表页签上执行语句后，筛选和新增仍在。
- 再点一次表页签，编辑器回到这张表的 `LIMIT` / `OFFSET` 浏览语句。
- 查询页签仍是 `SQL 1`，没有「默认视图」按钮。

## 架构

| Piece | File |
|---|---|
| Compare editor SQL with the browse statement | `sqlDiffersFromTableBrowse` in `src/components/db/workbenchModel.ts` |
| Button | grid toolbar in `src/components/db/DbWorkbench.tsx` |
| Copy | `dbRestoreTable` in `src/i18n/locales/zh-CN/shell.json` and `en/shell.json` |
| Tests | `workbenchModel.test.ts`, `e2e/db-workbench.spec.ts` |

## 设计

- 表还停在默认浏览语句时，工具条只有筛选和新增。
- 用户改了语句并执行后，筛选和新增旁边出现文字按钮「默认视图」。
- 点它之后，网格和编辑器回到这张表第一页、无筛选的浏览语句，按钮消失。

---

### Task 1: Default view button

- [x] Failing test: custom SQL differs from the browse statement; the same statement does not.
- [x] See it fail.
- [x] Show the button and reload the table browse from it.
- [x] E2E: hidden on the default browse, visible after a custom run, hidden again after the click.
- [x] `./scripts/run-all-tests.sh` passes.

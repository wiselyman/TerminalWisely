# Restore table icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The default-view control is an icon button, shown only when the statement is not the table browse.

**Architecture:** Same visibility as `sqlDiffersFromTableBrowse`. The button uses a restore icon and keeps the existing label as its accessible name and tooltip.

**Tech Stack:** TypeScript, Playwright, Lucide.

## Global Constraints

- Develop on `main` only. No Cursor commit trailers.
- Hidden while the editor still matches the table browse.
- Clicking it still reloads the default browse.
- Gate: `./scripts/run-all-tests.sh` green before claiming done.

---

## 要保住的旧行为

- 表停在默认浏览语句时，结果工具条没有这个按钮。
- 自定义语句执行后按钮出现；点它后编辑器回到 `LIMIT` / `OFFSET`，按钮消失。
- 筛选和新增仍是原来的图标按钮。

## 架构

| Piece | File |
|---|---|
| Icon button | `src/components/db/DbWorkbench.tsx` |
| Size matches the filter button | `src/App.css` |
| Accessible name | existing `dbRestoreTable` strings |
| E2E | `e2e/db-workbench.spec.ts` |

## 设计

- 按钮是 22px 的恢复图标，没有文字。
- 悬停和读屏名称仍是「默认视图」。
- 它排在筛选和新增旁边。

---

### Task 1: Icon instead of a text button

- [x] E2E expects an icon and the accessible name, not button text.
- [x] See the text assertion fail, then switch the control to the icon.
- [x] `./scripts/run-all-tests.sh` passes.

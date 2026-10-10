# Selected connection border Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The selected database connection card has one continuous border. The extra outline that the sidebar clips is gone.

**Architecture:** `.saved-item.selected` draws `outline: 1px` outside the rounded card. The sidebar is `overflow: hidden`, so that outline is cut on the left and right. The database row overrides selected chrome to a single border-color and clears the button focus ring.

**Tech Stack:** CSS, Playwright.

## Global Constraints

- Develop on `main` only. No Cursor commit trailers.
- Host saved-item cards keep their existing selected outline.
- Gate: `./scripts/run-all-tests.sh` green before claiming done.

---

## 要保住的旧行为

- Unselected connection cards keep the same border, radius, and hover actions.
- Selecting a connection still marks the row `.selected` and opens the service tab.
- Edit and delete actions still appear on hover or focus.

## 架构

| Piece | File |
|---|---|
| Selected row uses border-color, not outline | `src/App.css` `.db-connection-row.saved-item.selected` |
| Button focus ring does not draw a second rectangle | same file |
| Assertion | `e2e/db-workbench.spec.ts` computed `outline-style` |

## 设计

- The selected PostgreSQL card is one rounded rectangle. The stroke is the accent color and sits on the card's own border. No second line outside it, and no clipped segments at the sidebar edge.

---

### Task 1: One border on the selected connection

- [x] Failing E2E: the selected `.db-connection-row` has `outline-style: none`.
- [x] See it fail.
- [x] Set `outline: none` and `border-color` to the accent. Clear the main button focus outline.
- [x] `./scripts/run-all-tests.sh` passes.

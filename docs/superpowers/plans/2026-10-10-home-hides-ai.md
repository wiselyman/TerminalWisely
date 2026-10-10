# Hide AI chat on Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Home welcome page does not show the AI chat. Leaving Home for a database service tab shows that service's chat again.

**Architecture:** `shouldShowAiEngineerPanel` gains `homeOpen`. App passes the Home flag. The store `open` flag stays set so the transcript is still there when the service tab is selected. The titlebar AI button leaves Home so the chat opens on the service, not on the welcome page.

**Tech Stack:** TypeScript, Vitest, Playwright.

## Global Constraints

- Develop on `main` only. No Cursor commit trailers.
- Home in the database view still keeps the database sidebar.
- One service still has one chat.
- Gate: `./scripts/run-all-tests.sh` green before claiming done.

---

## 要保住的旧行为

- K8s view still hides the panel until a cluster is selected.
- Hosts view still hides a chat that belongs to a different session.
- A closed panel or a missing session still stays hidden.
- Clicking a database service tab still shows its work and, if the chat was open, that chat.

## 架构

| Piece | File |
|---|---|
| Hide when Home is the active tab | `shouldShowAiEngineerPanel` in `src/lib/aiEngineer/panelVisibility.ts` |
| Pass `homeOpen` | `src/App.tsx` |
| AI tool click leaves Home | `AiEngineerTool` onClick in `src/App.tsx` |
| Tests | `panelVisibility.test.ts`, `e2e/db-workbench.spec.ts` |

## 设计

- User is on a database service with the chat open, then clicks Home. The welcome page fills the workspace. The chat is not on screen. The sidebar stays on databases.
- User clicks the PostgreSQL tab. The same chat is visible again.
- User clicks the titlebar AI button while Home is showing. Home closes and the chat opens on the current service.

---

### Task 1: Home hides the panel

- [x] Failing test: `homeOpen: true` returns false even when the panel is open and a session is bound.
- [x] See it fail.
- [x] Pass `homeOpen` from App. Leave Home when the AI tool is clicked.
- [x] E2E: after Home, the unparked AI panel count is 0; selecting the service tab shows it again.
- [x] `./scripts/run-all-tests.sh` passes.

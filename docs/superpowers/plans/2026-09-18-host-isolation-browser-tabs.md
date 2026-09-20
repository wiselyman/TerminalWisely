# Host Isolation + Browser Tabs Implementation Plan

> **For agentic workers:** Implement task-by-task. Checkboxes track progress.

**Goal:** Per-host workspace shell memory on SSH tab switch; per-host browser multi-tabs; Enter-only navigate; history icon.

**Architecture:** Snapshot/restore workspace shell on `setActiveTab`. Browser store holds `sessionBuckets[sessionId]` with tabs; live fields mirror the active host. One child webview per session.

**Tech Stack:** Zustand, React, Playwright, Vitest, existing Tauri `browser_*` commands.

## Global Constraints

- No agent hardcoding. Main-only git. Tests for new behavior. Absolute host isolation for browser tabs and shell.

---

### Task 1: Address bar Enter-only + history icon

**Files:** `BrowserPanel.tsx`, i18n, `App.css`, `e2e/host-browser.spec.ts`

- [ ] Remove Go button; Enter still submits
- [ ] History toggle uses icon; update e2e to press Enter

### Task 2: Per-host browser tabs

**Files:** `browserStore.ts`, `BrowserPanel.tsx`, unit tests, e2e, smoke, TEST_MATRIX

- [ ] Session buckets with tabs + nav stacks
- [ ] Tab strip UI; switch/new/close
- [ ] Flush/restore on `ensureForSession`

### Task 3: Per-host workspace shell memory

**Files:** `hostWorkspaceMemory.ts` (new), `sessionStore.ts`, `desktopStore.ts`, tests, e2e

- [ ] Snapshot/restore desktop vs AI vs none on `setActiveTab`
- [ ] Restore desktop apps/focusOrder/filesTab

### Task 4: Verify

- [ ] `./scripts/run-all-tests.sh`

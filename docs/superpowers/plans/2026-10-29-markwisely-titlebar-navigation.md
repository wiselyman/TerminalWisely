# MarkWisely Titlebar Drag and Editor Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make promoted MarkWisely titlebars draggable and remove the redundant “All files” editor button without trapping the user in the editor.

**Architecture:** Put Tauri's drag-region marker on the maximized app header itself, leaving window controls explicitly no-drag. Remove the editor's All files control; when the app is closed after its save/flush gate, reset MarkWisely to its start screen so reopening gives access to recent/open/new files. Keep file-picker cancel buttons and create-form back navigation unchanged.

**Tech Stack:** React, Tauri titlebar drag regions, Playwright.

**Spec:** Current user request and repository `AGENTS.md`.

## Global Constraints

- Preserve MarkWisely autosave, flush-on-close, reopen, and error handling.
- Preserve shared Desktop app titlebar controls and drag behavior for other applications.
- Do not change file picker cancellation or create-form navigation.
- Add regression tests first, observe them fail, then implement the smallest fix.
- Run `node scripts/check-no-agent-hardcoding.mjs` and `./scripts/run-all-tests.sh`.

## Review Focus

- Promoted titlebar drag target is the header itself; minimize, maximize, and close controls remain no-drag and clickable.
- Floating MarkWisely window keeps its existing pointer-drag behavior.
- Closing an edited file flushes pending edits before returning to the start screen on the next open.
- Removing “All files” does not remove cancel controls from file pickers or the create form.
- Home/local and SSH MarkWisely use the same navigation behavior.

## 要保住的旧行为

- MarkWisely saves dirty content before closing and reports a save error without losing the document.
- MarkWisely can open a recent Markdown file after the app is relaunched.
- Floating titlebar drag and all three titlebar window controls continue to work.
- Maximized app controls stay clickable and retain maximize/restore/close behavior.
- Folder/file picker Cancel buttons and the create form's Back/Cancel buttons remain available.

## 架构

- `src/components/desktop/DesktopAppWindow.tsx`: mark the promoted maximized header as a Tauri drag region; controls remain governed by the existing no-drag CSS.
- `src/components/desktop/MarkWiselyWindow.tsx`: remove the edit-screen All files button and reset view to `start` after a successful close/save gate.
- `e2e/host-desktop.spec.ts`: assert promoted header drag marker, removed button, close/reopen-to-recents navigation, and autosave-before-close.
- `e2e/home-local-terminal-chat.spec.ts`: assert the same removed control and local close/reopen route.

## 设计

- Dragging unused space in the maximized MarkWisely app header moves the native application window; the header's minimize/maximize/close controls remain interactive.
- The edit screen contains no “All files” button. Closing MarkWisely saves pending changes and returns the app to its launch screen when opened again; recent files remain available there.
- Loading, save success, and save failure messages retain their existing locations and wording.

## Tasks

### Task 1: Promoted titlebar drag region

**Files:**
- Modify: `src/components/desktop/DesktopAppWindow.tsx`
- Test: `e2e/host-desktop.spec.ts`

**Interfaces:**
- The promoted header carries `data-tauri-drag-region`; existing button no-drag rules remain unchanged.

- [x] Add a failing assertion that the maximized `.desktop-app-window-head` has the Tauri drag-region marker, then run the focused MarkWisely maximize E2E and observe failure (`data-tauri-drag-region` was null).
- [x] Add the drag-region attribute to the shared header only for maximized mode.
- [x] Re-run the focused test; the promoted header marker is present and maximize/restore controls remain clickable.
- [x] Commit this task independently (`34e3fbba`).

### Task 2: Remove All files and preserve navigation through close/reopen

**Files:**
- Modify: `src/components/desktop/MarkWiselyWindow.tsx`
- Test: `e2e/host-desktop.spec.ts`
- Test: `e2e/home-local-terminal-chat.spec.ts`

**Interfaces:**
- A successful `handleCloseRequest` closes the current document and resets the view to `start`; a failed save returns false and leaves the editor open.

- [x] Update remote and local MarkWisely E2E flows to assert the editor has no All files button, close/reopen to the start screen, and reopen a recent file.
- [x] Run the focused tests and observe failure before implementation: the editor button was present; the promoted header lacked its drag marker.
- [x] Remove only the editor All files button and reset the view after successful close/save; retain picker and form navigation controls.
- [x] Run the focused remote/local tests and verify autosave-before-close still works; all three passed.
- [x] Commit this task independently (`facca50f`).

### Task 3: Repository verification

**Files:**
- Verify: `src/components/desktop/DesktopAppWindow.tsx`
- Verify: `src/components/desktop/MarkWiselyWindow.tsx`
- Verify: `e2e/host-desktop.spec.ts`
- Verify: `e2e/home-local-terminal-chat.spec.ts`

- [x] Run `node scripts/check-no-agent-hardcoding.mjs` (PASS).
- [x] Run `./scripts/run-all-tests.sh` and require every stage to pass (10/10 stages; 592 Vitest, 115 Playwright, 502 sidecar, Rust checks).
- [x] Review only this task's diff; keep existing untracked files unstaged.
- [ ] Commit verification state and push `main` only after all checks pass.

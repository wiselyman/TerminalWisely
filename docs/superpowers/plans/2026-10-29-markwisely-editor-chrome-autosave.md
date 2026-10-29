# MarkWisely Editor Chrome and Autosave Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center the open Markdown filename in MarkWisely's app titlebar, replace the manual Save control with a bottom-right autosave status, and keep the editor responsive after maximize/restore.

**Architecture:** Extend `DesktopAppWindow` with an optional centered titlebar node so MarkWisely can provide the current filename in both floating and promoted titlebars. Keep autosave in `MarkWiselyWindow`; render its live status as an unobtrusive editor-corner indicator. Fix resizing at the shared Vditor wrapper so editor internals track the actual content width whenever the window changes size.

**Tech Stack:** React, TypeScript, CSS, Vditor, Playwright.

**Spec:** User request in this task and repository instructions in `AGENTS.md`.

## Global Constraints

- Preserve current MarkWisely document creation, opening, autosaving, navigation, error reporting, and close handling.
- Preserve the shared `DesktopAppWindow` titlebar controls and maximize/restore behavior for every Desktop app.
- Do not add unrelated product behavior or hardcoded task-specific agent logic.
- Follow test-first implementation and run `node scripts/check-no-agent-hardcoding.mjs` and `./scripts/run-all-tests.sh` before declaring completion.

## Review Focus

- Autosave still persists edits after the Save button is removed; the existing saved-status and remote-save checks cover this.
- The filename stays centered in both floating and promoted titlebars and truncates safely when long; the titlebar E2E assertions cover the presence and layout.
- Restoring a narrow MarkWisely window does not leave Vditor internals at a stale pixel width; the resize E2E checks internal and host widths.
- Save errors remain visible while the status is moved to the lower-right; existing error path plus `role=status` location assertions cover this.
- Other Desktop apps retain their existing titlebar and maximize controls; shared-component E2E checks continue to cover title and controls.

## 要保住的旧行为

- Editing a MarkWisely document automatically saves changes and eventually shows the localized Saved status.
- Navigating away from a dirty document and closing MarkWisely flushes and saves before the document is closed.
- MarkWisely shows save errors with `role="alert"` and keeps the document available for retry.
- Maximize and restore continue to use the app-level titlebar controls and restore the same document and editor contents.
- Other Desktop apps continue to display their existing titles and window controls.

## 架构

- `src/components/desktop/DesktopAppWindow.tsx`: add optional `centerTitle?: ReactNode` and render it in the shared app titlebar, including the titlebar promoted into application chrome while maximized.
- `src/components/desktop/MarkWiselyWindow.tsx`: pass the open document basename as `centerTitle`; remove the manual Save button; retain autosave and status semantics.
- `src/components/desktop/MarkWiselyWindow.css`: center/truncate the filename title and position save status at the bottom-right of the editing surface without covering text.
- `src/components/preview/MarkdownWysiwygEditor.tsx`: respond to actual wrapper/container resize and update Vditor's width-dependent internal nodes.
- `e2e/host-desktop.spec.ts`: cover titlebar filename, absence of manual Save, autosave status placement, responsive editor after narrow-resize/maximize/restore, and existing autosave behavior.
- Dependency direction remains Desktop UI -> shared editor wrapper; the shared titlebar accepts generic React content and does not depend on MarkWisely.

## 设计

- Open a file and show its basename centered in the app titlebar; MarkWisely remains identified at the left and window actions remain at the right.
- Autosave remains debounced. “Saving…”, “Unsaved”, and “Saved” appear in a compact status at the bottom-right of the editor; failures remain in the existing alert area.
- Maximize/restore retains the same editor instance and content. If the editor is still initializing or the viewport changes, its text area follows the available width instead of retaining a stale narrow width.
- Loading, success, and failure feedback remain in the editor area; no new dialogs are introduced.

## Tasks

### Task 1: MarkWisely titlebar filename and autosave status

**Files:**
- Modify: `src/components/desktop/DesktopAppWindow.tsx`
- Modify: `src/components/desktop/MarkWiselyWindow.tsx`
- Modify: `src/components/desktop/MarkWiselyWindow.css`
- Test: `e2e/host-desktop.spec.ts`

**Interfaces:**
- `DesktopAppWindow` consumes an optional `centerTitle?: ReactNode` and renders it consistently in floating and maximized headers.
- MarkWisely supplies the basename only while a document is open for editing.

- [x] **Step 1: Write a failing Playwright assertion** in the maximize/restore test: the filename is present in the titlebar, no `[data-testid="markwisely-save"]` button exists, and the status is located near the editor's bottom-right corner.
- [x] **Step 2: Run** `npm run test:e2e -- --grep "MarkWisely editor resizes after maximizing and restoring its window"`; confirm it fails on missing centered title/no-save behavior.
- [x] **Step 3: Implement** the optional shared `centerTitle`, pass the MarkWisely basename, remove the manual Save control, and position the status indicator at the editor's bottom-right.
- [x] **Step 4: Run** the focused title/autosave and resize E2E tests; both passed.

### Task 2: Vditor width recovery after maximize and restore

**Files:**
- Modify: `src/components/preview/MarkdownWysiwygEditor.tsx`
- Modify: `src/components/desktop/MarkWiselyWindow.css`
- Test: `e2e/host-desktop.spec.ts`

**Interfaces:**
- Shared editor wrapper continues accepting the same props; its internal resize observer updates Vditor layout to match the editor host's current content width.

- [ ] **Step 1: Strengthen the resize E2E** to capture editor host, Vditor root, and editable surface widths after narrow resize, maximize, and restore; assert the editable width is at least 80% of the host and at least 240 CSS pixels when the host is at least 300 CSS pixels.
- [ ] **Step 2: Run** the focused resize E2E and inspect measured widths to reproduce the stale-layout behavior before changing production code.
- [ ] **Step 3: Implement** resize observation/measurement against the actual available content width and schedule Vditor reflow after visibility/layout transitions; keep width constraints fluid rather than pinning stale narrow widths.
- [ ] **Step 4: Run** the focused resize E2E; it passed and the file-preview visual baseline remained unchanged.

### Task 3: Repository verification

**Files:**
- Verify: `src/components/desktop/DesktopAppWindow.tsx`
- Verify: `src/components/desktop/MarkWiselyWindow.tsx`
- Verify: `src/components/desktop/MarkWiselyWindow.css`
- Verify: `src/components/preview/MarkdownWysiwygEditor.tsx`
- Verify: `e2e/host-desktop.spec.ts`

- [x] **Step 1:** Run `node scripts/check-no-agent-hardcoding.mjs`; PASS.
- [ ] **Step 2:** Run `./scripts/run-all-tests.sh`; expect the complete suite to pass.
- [ ] **Step 3:** Review the final diff and ensure pre-existing untracked files are not staged.
- [ ] **Step 4:** Commit the implementation on `main` and push to `origin main` only after all checks pass.

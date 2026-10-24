# TerminalWisely 0.0.9 Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the 0.0.9 fixes by rendering release notes, making the titlebar workspace switches reliably one-click, showing Linux file metadata in Desktop, and moving remote file actions out of Terminal while preserving them in Desktop.

**Architecture:** Reuse the existing markdown renderer for signed release notes and the existing `UpdateAvailableDialog`/store flow. Keep workspace switching in the current stores and titlebar controls, with an explicit one-click regression contract. Extend remote directory metadata from the Rust SSH listing command through `LocalFsEntry` into the Desktop file list. Remove file-path activation and upload/drop affordances from `TerminalView`, leaving shell input/output and text-selection actions intact; retain file actions in `LocalFsPanel` inside Desktop.

**Tech Stack:** React, Zustand, TypeScript, marked, Playwright, Rust, serde, SSH command output parsing, Vitest.

**Spec:** User request in this conversation. Previous approved startup update dialog change is included so the release notice is visible from startup.

## Global Constraints

- Keep manual update checks, the update confirmation/install path, and no-update/error behavior intact.
- Do not alter workspace semantics, chat context, or Desktop panel memory while fixing titlebar switching.
- Expose Linux file modification time, symbolic permissions, owner, and group; unavailable metadata displays the existing em dash convention.
- Preserve Terminal command input/output, text selection, clipboard, and normal web links; remove only remote file transfer/preview/path actions from Terminal.
- Preserve the equivalent file upload/download, preview, move, send, and file-management operations in Desktop.
- Do not publish or tag a GitHub release as part of this implementation request.
- Do not modify unrelated user work or untracked handoff artifacts.

## 要保住的旧行为

- Manual update check with an available release continues to populate `pending` and `dialog`; Install and Later continue using the existing updater flow.
- Startup update check remains delayed until the app UI settles, runs only in Tauri, and stays quiet when current or when the check fails.
- Chat and Desktop titlebar controls continue to respect the active space and ready-session requirements; one click switches between the two panels.
- Desktop file manager continues to list directories before files, open on double click, preview files, and provide upload/download and file-management context actions.
- Terminal commands still execute and render output, and selecting/copying terminal text still works.
- Linux filenames containing spaces and tabs remain intact when the remote directory listing gains metadata fields.

## 架构

- `src/components/UpdateAvailableDialog.tsx`: render `update.body` as the existing safe-in-app markdown presentation rather than a `<pre>` source block; the existing `AiMarkdown` renderer handles markdown structure and external links.
- `src/stores/appUpdateStore.ts`, `src/App.tsx`: startup available-update state opens the existing dialog; keep current delay and Tauri guard.
- `src/components/aiEngineer/AiEngineerTool.tsx`, `src/components/LocalFsTool.tsx`, `src/App.css`, `e2e/host-desktop.spec.ts`: harden titlebar controls as interactive non-drag targets and pin one-click transitions. The Mac mini report is not reproducible on the current MacBook; verify browser/native event routing before choosing any further event-handler change.
- `src-tauri/src/fs_remote.rs`, `src/types/index.ts`, `src/components/LocalFsContentsView.tsx`, `src/styles/desktop.css`, `src/i18n/locales/{en,zh-CN}/tools.json`: carry remote `modified_ms`, symbolic permission string, owner, and group metadata to list/grid rows.
- `src/components/TerminalView.tsx`, `src/components/TerminalLinkContextMenu.tsx`, `src/components/TerminalPathContextHighlight.tsx`, `e2e/ssh-drag-upload.spec.ts`, `e2e/terminal-links.spec.ts`: remove remote file path click/context actions and Terminal drag upload, preserving the blank text-selection menu. `LocalFsPanel` remains the implementation for Desktop file actions.
- `src/e2eBootstrap.ts`, `e2e/tw-e2e.ts`, focused Playwright specs, Rust unit tests: provide deterministic regression coverage without using real SSH servers or the update network.

## 设计

- When an update is discovered, the existing modal shows the release notes with rendered headings, lists, links, and tables; users can Install, Later, or open releases as before. No release notes or no update produces no markdown section.
- In Hosts, clicking Chat once opens Chat and closes Desktop; clicking Desktop once opens Desktop and closes Chat. The buttons remain excluded from the draggable titlebar region. Since the Mac mini issue cannot be reproduced here, native click-through behavior must be verified before changing event semantics.
- Desktop list view shows Name, Permissions, Owner, Group, Size, and Modified. Grid cards show the same metadata in a compact secondary line; absent metadata uses “—”.
- Terminal remote paths remain ordinary terminal text. Clicking or right-clicking them does not open a file, download, transfer, preview, or file action menu. Dropping local files over Terminal does not upload or show an upload overlay. Desktop keeps those file operations.

## Review Focus

- An available update discovered by the delayed startup check must open the modal even while the Home sidebar is hidden.
- Markdown link text must be rendered as a link but must not navigate the application WebView away from the update dialog.
- Chat/Desktop switching must work on the first click from either panel and remain enabled only when the existing session guard allows it.
- Remote names with spaces/tabs must not be truncated or merged with adjacent metadata.
- Remote hosts without GNU `find -printf` support must still list files; missing metadata must stay optional rather than making the file browser fail.
- Terminal file actions must not be reachable by click, modifier-click, context menu, or OS file drop, while Desktop retains them.

## Tasks

### Task 1: Render update notes and show startup updates

**Files:**
- Modify: `src/components/UpdateAvailableDialog.tsx`
- Modify: `src/stores/appUpdateStore.ts`
- Modify: `src/App.tsx`
- Test: `src/stores/appUpdateStore.test.ts`
- Test: `e2e/update-dialog.spec.ts`
- Modify: `src/e2eBootstrap.ts`, `e2e/tw-e2e.ts`

**Interfaces:**
- Consumes: `checkForAppUpdate(): Promise<UpdateCheckResult>` and existing `UpdateAvailableDialog` props.
- Produces: available startup check sets `pending` and `dialog` to the same `PendingAppUpdate`; rendered release notes expose stable `data-testid="update-notes"`.

- [x] Add/extend store tests for available, current, and failed startup checks; include stale dialog cleanup for current version.
- [x] Run `npm test -- --run src/stores/appUpdateStore.test.ts` and see the missing dialog/cleanup assertion fail before changing source.
- [x] Add a deterministic E2E update-dialog fixture and assert Markdown heading/list/table markup renders instead of a `<pre>` source block; assert update links stay in the external-link path.
- [x] Replace raw `<pre>` notes with the existing `AiMarkdown` renderer and ensure quiet startup check opens the dialog when a release is available.
- [x] Run targeted unit and E2E tests and verify Home startup still uses the existing four-second Tauri-only check.
- [x] Commit Task 1 after its scoped tests pass.

### Task 2: Make Chat/Desktop workspace switching respond on one click

**Files:**
- Modify as justified by reproduction: `src/App.tsx`, `src/components/aiEngineer/AiEngineerTool.tsx`, `src/components/LocalFsTool.tsx`, `src/App.css`
- Test: `e2e/host-desktop.spec.ts`

**Interfaces:**
- Consumes: current `switchToAiEngineerPanel`, `switchWorkspacePanel`, and `closeDesktopRemembering` state transitions.
- Produces: one pointer activation switches Chat ↔ Desktop once, without a second click and without disabling the titlebar drag region.

- [x] Add a Playwright regression that clicks Chat and Desktop once in both directions and asserts the destination is visible and the previous panel is closed after each click.
- [x] Run the new test and inspect the DOM event target and computed `-webkit-app-region` for both controls; compare against the working titlebar controls.
- [x] The test did not identify a hit-target/drag-region issue, so no speculative event-handler changes were made.
- [x] Browser E2E passes; Mac mini issue remains unreproducible here. Current store transitions are preserved. Native test script is unavailable on this Mac because it hardcodes `/opt/cursor/artifacts`; the Mac mini still needs a native one-click check.
- [x] Focused desktop E2E passes; native desktop check was attempted and could not run on this host (script requires `/opt/cursor/artifacts`).
- [x] Commit the regression contract after its scoped E2E passes; no product source change was justified by current evidence.

### Task 3: Show Linux file metadata in Desktop

**Files:**
- Modify: `src-tauri/src/fs_remote.rs`
- Modify: `src/types/index.ts`
- Modify: `src/components/LocalFsContentsView.tsx`
- Modify: `src/styles/desktop.css`
- Modify: `src/i18n/locales/en/tools.json`, `src/i18n/locales/zh-CN/tools.json`
- Modify: `src/e2e/fixtures.ts`
- Test: `src-tauri/src/fs_remote.rs` unit tests, `e2e/local-fs.spec.ts`

**Interfaces:**
- `RemoteFsEntry` and frontend `LocalFsEntry` add optional `modified_ms: number`, `permissions: string`, `owner: string`, and `group: string`.
- Existing remote list response retains `name`, `path`, `kind`, and `size_bytes` and preserves existing GNU find fallback behavior.

- [x] Add Rust parser tests for file and directory records, unknown metadata, and names containing spaces/tabs; metadata field assertions failed before implementation.
- [x] Extend the `find -printf` record with permission, owner, group, size, modified time, and NUL-delimited name; keep the current fallback listing with absent metadata.
- [x] Add localized metadata columns/compact grid details and em-dash rendering for absent values.
- [x] Extend E2E directory fixtures and assert Desktop list and grid views display metadata. Local FS panel/actions regression: 5 passed.
- [x] Rust parser tests (4) and focused Local FS E2E (5) passed; Playwright build also type-checks the frontend.
- [x] Commit Task 3 after its scoped tests pass (`d136eb4`).

### Task 4: Remove remote file actions from Terminal and keep them in Desktop

**Files:**
- Modify: `src/components/TerminalView.tsx`
- Modify: `src/components/TerminalLinkContextMenu.tsx`
- Remove or stop mounting: `src/components/TerminalPathContextHighlight.tsx`
- Test: `e2e/terminal-links.spec.ts`, `e2e/ssh-drag-upload.spec.ts`, `e2e/local-fs-actions.spec.ts`

**Interfaces:**
- Terminal shell input/output and `TerminalBlankContextMenu` text selection actions remain.
- Desktop `LocalFsPanel` remains the sole UI entry point for remote file download, upload/drop, preview, send, and file operations.

- [x] Rewrite E2E contracts so printed remote paths cannot activate preview or display a remote file menu, and a terminal file drop creates no upload request or overlay.
- [x] Ran focused E2E first; prior path menu/preview and drag upload/overlay failed the new absence assertions.
- [x] Remove Terminal filesystem path activation/context actions and Terminal upload/drop handling; retain normal command interaction and the blank text-selection menu.
- [x] Desktop E2E verifies download, preview, send-to-chat, cross-server send, rename, delete, move, and background upload menu.
- [x] Focused Terminal/drag/Desktop E2E passed (5 tests); expanded Desktop action test passed.
- [x] Commit Task 4 after its scoped tests pass (`bd2246f`).

### Task 5: Full verification

**Files:**
- Update: `docs/TEST_MATRIX.md` only if the existing feature/test mapping requires a new feature row.

- [x] Run `node scripts/check-no-agent-hardcoding.mjs` (7 rules, 95 Python files; PASS).
- [x] Run `./scripts/run-all-tests.sh`; 260 checks passed, 0 failed, 1 blocked, 502 Python tests passed with 3 environment skips, and all 100 Playwright E2E tests passed. SSH/K8s live integration was skipped because Docker/k3d are unavailable.
- [x] The full run found the expected local-files visual change from metadata columns plus a variable-width masked clock. Fixed the clock mask width in the E2E harness, confirmed the visual diff, and refreshed only the affected local-files dark/light baselines. Re-ran the focused baseline test without update mode successfully.
- [x] Inspect `git diff --check` and verify only this plan, its tests, and planned source files are included; unrelated existing untracked handoff artifacts remain untouched.
- [x] Do not tag or publish; this request defines 0.0.9 scope but does not authorize a GitHub release.

## Execution Method

Implement task-by-task in this session using the project's required red/green test sequence. Develop on `main` as required by the repository instructions, despite the generic isolated-worktree recommendation. Do not delegate or request another tool's review. The Mac mini interaction issue cannot be reproduced on the current MacBook, so only make a titlebar code change when the focused regression or native event inspection provides evidence.

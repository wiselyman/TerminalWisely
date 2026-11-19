# Files Finder / SFTP Implementation Plan

> **For agentic workers:** Execute tasks in order in this session. Each task uses test-first red/green steps.

**Goal:** Give Local Desktop and SSH Desktop a consistent Finder-style Files application with common file operations, context menus, and native local trash behavior.

**Architecture:** Local and SSH targets retain separate operation adapters because their APIs and transfer capabilities differ. `LocalDesktopFileManager` uses the shared contents, tree, path, and context-menu views also used by `LocalFsPanel`; local operations route through `localFsApi`, while SSH operations retain current session-backed flows. Rust local filesystem commands own local metadata and trash behavior. This keeps the UI primitives aligned without sending local paths through an SSH session.

**Tech Stack:** React, TypeScript, Vitest, Playwright, Tauri 2, Rust, `trash` crate.

**Spec:** User-approved Files Finder / SFTP plan in the conversation (2026-11-19).

## Global Constraints

- Keep Local Desktop and SSH Desktop file operations scoped to their respective targets.
- Local deletion moves items to the OS trash; errors never fall back to permanent deletion.
- Remote deletion remains confirmed and permanent; remote upload/download stay tied to the active session.
- Follow repository TDD and full-suite requirements; do not add unrelated behaviors.

## 要保住的旧行为

- Opening a local directory continues to browse through `list_local_directory`; a failed read is shown as an error and does not silently change the current path.
- SSH directory navigation and file actions continue to use the already connected session rather than creating another connection.
- Double-clicking a directory navigates into it; opening a supported file continues to use the existing preview/editor path.
- Hidden files remain controlled by the existing toggle, and remote metadata columns keep displaying parsed permission/owner/group values.
- Cancelling a delete confirmation leaves every selected path in place.

## 架构

- `FileManagerPanel.tsx`: keep local and SSH app adapters distinct, selected by the active `DesktopTarget`.
- `LocalFsPanel.tsx` and `LocalDesktopFileManager.tsx`: own target-specific operation routing while sharing navigation, tree, contents, and context-menu primitives. Keep session-dependent remote features remote-only.
- `LocalFsContentsView.tsx`, `LocalFsTreeView.tsx`, `LocalFsContextMenu.tsx`: reuse for both targets; optional menu actions represent capabilities unavailable locally.
- `LocalDesktopFileManager.tsx`: retain as the local operation adapter and preserve its local directory persistence behavior.
- `localFsApi.ts`, `src/types/index.ts`, `src-tauri/src/fs_local.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`: add local metadata and a `trash_local_path` API/command, implemented with the cross-platform `trash` crate.
- Tests: add focused Vitest coverage for local API wiring/metadata formatting and extend `e2e/local-fs-actions.spec.ts` for local Files UI; extend SSH coverage only where shared UI wiring changes observable behavior.

## 设计

- Local and SSH Files use the same toolbar, breadcrumb path, tree sidebar, list/grid switch, search, sorting, multi-select, and status area. List columns are Name, Permissions, Owner, Group, Size, Modified; unavailable local Unix fields render as `—`.
- Toolbar and context menus expose common operations: open/preview, copy name/path/items, cut/paste, duplicate, rename, move, delete, new file/folder, refresh. SSH additionally exposes upload/download and transfer progress. Keep editor open and existing drag-to-move behavior.
- Directory loading appears in the contents area; successful operations refresh the affected directory and retain valid selection; failures appear in the panel error/status area. Empty directories and empty search results have explicit states.
- Deletion asks for confirmation. Local confirmation moves selected entries to system trash; remote confirmation permanently deletes selected entries. Cancel is a no-op; trash or remote operation errors are surfaced without claiming success.

## Review Focus

- A symlink or unavailable metadata must not make local directory listing fail; test metadata fields remain nullable.
- Moving an item into trash can fail due to OS permissions or volume behavior; test the error propagates and no permanent-delete fallback runs.
- A local-target Files panel must not invoke any SSH session command; assert through the local UI/API route.
- Session loss during an SSH upload/download must show the existing transfer error and leave the Files panel usable.
- Searching and filtering must not mutate the underlying directory listing or selection outside visible entries.

---

### Task 1: Local metadata and trash API

**Files:** `src-tauri/src/fs_local.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src/lib/localFsApi.ts`, `src/types/index.ts`, corresponding Rust and Vitest tests.

**Interfaces:**
- Add optional `permissions`, `owner`, and `group` to local entries, using Unix metadata where available and null elsewhere.
- Add Tauri command `trash_local_path(request: LocalPathRequest) -> Result<(), String>` and TS wrapper `trashLocalPath(path: string): Promise<void>`.

- [x] Write Rust tests for Unix metadata and trash success/error behavior; write a Vitest assertion that `deleteLocalPath` invokes `trash_local_path` with `{ request: { path } }`.
- [x] Run focused tests and confirm they fail for the missing behavior.
- [x] Add the `trash` crate, populate optional metadata without failing directory listing on unsupported platforms, and implement/register the trash command.
- [x] Run the focused Rust and Vitest tests and confirm they pass.

### Task 2: Common panel target and local navigation

**Files:** `src/components/desktop/FileManagerPanel.tsx`, `src/components/LocalFsPanel.tsx`, `src/components/desktop/LocalDesktopFileManager.tsx`, `src/stores/localFsStore.ts`, component tests.

**Interfaces:**
- Change `LocalFsPanel` props to accept `target: DesktopTarget`, with optional `sessionId` and `sessionTitle`; local target must never invoke SSH APIs.
- Keep local last-directory persistence under `tw.desktop.local.files.last-directory`.

- [x] Add an E2E regression proving local Files uses the shared contents/tree layout and calls local listing, while the existing SSH path remains remote-session-backed.
- [x] Run the focused test and confirm the current split rendering failed the initial Home/local target setup; fix the E2E bootstrap to enter Home before opening local Files.
- [x] Initialize local path/history from local roots and persisted last path, and route directory loads through the local API; retain SSH store initialization for remote.
- [x] Run focused store/API and local/remote Files tests.

### Task 3: Local file operations and context menus

**Files:** `src/components/LocalFsPanel.tsx`, `src/components/LocalFsContextMenu.tsx`, `src/lib/localFsApi.ts`, i18n files, Vitest tests.

**Interfaces:**
- Local capability actions call existing local create/read/write/rename/move/open/reveal APIs and `trashLocalPath`; remote-only upload/download/send-to-remote actions are omitted for local target.
- Local item context menu and background menu support common actions; local confirmation uses the existing destructive confirmation pattern.

- [x] Add UI/API coverage for local right-click duplicate/rename/delete cancel and confirmation, plus toolbar new-folder; API tests verify trash routing.
- [x] Run the focused tests; the initial local Files E2E was red because it opened the file manager outside the Home workspace, then passed after bootstrapping the local target correctly.
- [x] Route actions through local APIs, preserve EditorWisely opening, support local duplicate/copy-paste, and refresh affected directories after success.
- [x] Run focused local operations and existing local filesystem tests.

### Task 4: Shared table metadata and remote parity

**Files:** `src/components/LocalFsContentsView.tsx`, `src/components/LocalFsTreeView.tsx`, `src/components/LocalFsPanel.tsx`, i18n, `e2e/local-fs-actions.spec.ts`, `e2e/host-desktop.spec.ts`.

**Interfaces:**
- Reuse current remote file context actions and transfer state; add target-aware visibility only where a capability is unavailable.

- [x] Extend Playwright coverage for local/SSH layout, metadata columns, sorting, context menus, remote upload/download visibility, local create/rename/duplicate/delete, and refresh behavior.
- [x] Run affected E2E cases; the first local workspace visibility expectation was red until the local target bootstrap opened Home first.
- [x] Align tree/list/grid, toolbar, search, empty/loading/error states, metadata columns, and selection behavior through shared view primitives while preserving remote SFTP flows.
- [x] Run the affected local filesystem E2E cases and frontend build.

### Task 5: Acceptance and regression pass

**Files:** `docs/TEST_MATRIX.md` and any tests required by findings.

- [x] Update the Files row in the test matrix with local/SSH parity, right-click actions, and trash semantics.
- [x] Run the hardcoding check through the `run-all-tests.sh` smoke stage.
- [x] Run the full `./scripts/run-all-tests.sh`; all automated stages passed.
- [x] Run the Files Playwright paths and confirm local and SSH behavior separately.

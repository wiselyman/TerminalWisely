# Files content detection and run scripts

> **For agentic workers:** Execute tasks in order. Each task uses test-first red/green steps.

**Goal:** Let Files preview text based on file contents when an extension is unknown, and add a right-click action that opens a `.sh` file in the active target's Terminal for execution.

**Architecture:** `fileType.ts` will decide whether a path is a known preview format or a bounded candidate that should be verified by the backend; it will not map special filenames/extensions to text. `preview.rs` will classify unknown-extension files using a bounded content probe that rejects binary data. `LocalFsPanel` will add an SSH `.sh` menu action using the existing terminal command insertion API; `LocalDesktopFileManager` will queue a properly quoted command to the persistent local terminal through a small local terminal command bridge. `LocalFsContextMenu` will render the capability only when supplied.

**Tech Stack:** React, TypeScript, Vitest, Playwright, Tauri, Rust.

## 要保住的旧行为

- Known text formats still open in the editable preview without a binary probe.
- Known image, office, archive, media, and PDF formats keep their existing preview handlers.
- Unknown binary content is rejected by backend preview validation and is not shown as editable text.
- File/directory double-click behavior, SSH current-session routing, and local/remote target isolation remain unchanged.
- Running a script sends only the selected path as a safely quoted argument; it does not execute the file-manager search text or another selected entry.
- Non-shell files do not gain a script execution menu action; cancellation/closing the context menu does not send a terminal command.

## 架构

- `src/lib/fileType.ts` and tests: unknown suffixes become bounded preview candidates, not presumed text; backend validation remains authoritative.
- `src-tauri/src/preview.rs`: add generic byte/text-likelihood validation for unknown formats, reusing the existing bounded SSH read. No filename, suffix, or application-name special cases.
- `src/components/LocalFsContextMenu.tsx`: optional `onRunInTerminal` capability.
- `src/components/LocalFsPanel.tsx`: expose Run in Terminal for shell scripts in SSH Files and invoke `insert_terminal_command` for the active session with safely quoted parent and file paths.
- `src/components/home/LocalTerminal.tsx` plus a small terminal command queue module: publish the live local terminal ID and accept a queued command so Local Files can launch Terminal then run the selected script.
- `src/components/desktop/LocalDesktopFileManager.tsx`: add the same script action for local files, using platform-appropriate shell invocation and safe path quoting.
- `e2e/local-fs.spec.ts`, preview unit tests, and a local terminal command-queue test: cover unknown text/binary content and script command routing.

## 设计

- Double-click or choose Edit & Preview for a small unknown-extension text file: Files sends the bounded preview request; valid text opens in the current preview/editor flow; binary content reports the existing unsupported-preview error.
- Right-click a `.sh` file: the menu offers Run in Terminal. Choosing it opens/restores Terminal in the same Desktop target, navigates to the containing directory, and submits the script invocation. Other menu actions and selection remain available.
- Failed preview, disconnected SSH session, or unavailable local terminal is shown through the existing toast/error area; no command is sent on menu dismissal.

## Tasks

### Task 1: Content-based fallback for unknown preview types

- [x] Add Vitest coverage proving an unknown suffix can reach backend validation while known binary and oversized unknown files remain gated.
- [x] Add Rust tests for generic text-like and binary byte samples; run and observe the missing classification behavior.
- [x] Implement bounded content fallback without special-casing filenames or extensions.
- [x] Run focused Rust and Vitest tests.

### Task 2: Run shell script in Terminal

- [x] Add a failing command builder test and terminal command queue test; observed the missing command module before implementation.
- [x] Implement optional menu action, safe shell argument quoting, SSH command insertion, and local terminal queue delivery.
- [x] Add Playwright coverage for SSH `.sh` menu visibility and target-scoped command submission.
- [x] Run focused tests and Files E2E.

### Task 3: Acceptance

- [ ] Update `docs/TEST_MATRIX.md` for content-based text fallback and shell execution.
- [x] Run `node scripts/check-no-agent-hardcoding.mjs`.
- [x] Run `./scripts/run-all-tests.sh` and resolve any failures test-first.
- [x] Run the affected Playwright path.

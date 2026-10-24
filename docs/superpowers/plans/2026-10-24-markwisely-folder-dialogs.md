# MarkWisely Folder Dialogs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both New Markdown and Open Markdown begin with a remote-folder picker dialog that visibly uses folder icons.

**Architecture:** Reuse the existing remote directory listing picker and present directory mode as an accessible modal dialog. New Markdown continues from the chosen folder to the filename form; Open Markdown transitions from the chosen folder to the existing Markdown-only file picker, scoped to that folder.

**Tech Stack:** React, TypeScript, lucide-react, Playwright.

**Spec:** User request in this turn.

## Global Constraints

- MarkWisely continues to manage Markdown files on the active SSH host.
- Preserve remote directory listing, Markdown filtering, save, recent-file, and dirty-document protection behavior.
- Do not add product capabilities or dependencies.

## Review Focus

- Empty or unreadable remote directories keep loading/error feedback inside the modal.
- Canceling either folder dialog returns to the appropriate prior view without opening or creating a file.
- Open flow only opens Markdown files from the chosen folder; navigation to a different directory remains available.
- Folder selection and path remain usable at narrow app-window sizes and via keyboard focus.

---

## 要保住的旧行为

- New Markdown still creates a remote file using the entered filename and selected parent directory.
- Open Markdown still filters non-Markdown files and opens the selected Markdown in the existing editor.
- Selecting a Markdown file does not replace the remembered directory used as the next picker’s starting path.
- Canceling Open Markdown never discards a dirty document; the existing dirty-document confirmation remains unchanged.
- Directory browsing, parent navigation, loading, errors, and cancel continue to work.

## 架构

| File | Responsibility |
|------|----------------|
| `src/components/desktop/MarkWiselyWindow.tsx` | Route New/Open through folder selection, then create form or file picker; keep folder and file picker dialogs in the existing app window layer. |
| `src/components/desktop/MarkWiselyFilePicker.tsx` | Accept an optional initial remote directory, expose dialog semantics for both modes, and render folder navigation/selection with folder icons. |
| `src/components/desktop/MarkWiselyWindow.css` | Style the modal folder chooser, folder icon rows, and folder action while reusing established dialog tokens. |
| `e2e/host-desktop.spec.ts` | Cover both entry paths, folder icon presence, chosen-folder scope, cancellation, and current Markdown creation/open flows. |

Dependency direction remains MarkWiselyWindow → MarkWiselyFilePicker → existing `list_remote_directory` command. No backend or store changes are required.

## 设计

- Click New Markdown → centered “Choose folder” dialog with navigable remote folders, folder glyphs, current path, Cancel and Use this folder → filename form prefilled with the selected folder → Create.
- Click Open Markdown → same folder-selection dialog → Use this folder changes the dialog to a Markdown file list scoped to that folder → select a file to edit.
- Directory loading and failures appear in the dialog body; Cancel closes the picker to Home or the create form that launched it.
- Folder rows use folder-shaped icons; the current path and selected folder action make the destination visible. Dialog controls retain visible keyboard focus.

## Tasks

### Task 1: Add modal folder selection to both entry paths

**Files:**
- Modify: `src/components/desktop/MarkWiselyWindow.tsx`
- Modify: `src/components/desktop/MarkWiselyFilePicker.tsx`
- Modify: `src/components/desktop/MarkWiselyWindow.css`
- Test: `e2e/host-desktop.spec.ts`

- [x] **Step 1: Write failing Playwright coverage** — Assert New Markdown opens a folder dialog before the filename form; Open Markdown opens a folder dialog before its file list; folder entries render an SVG folder icon; confirming a folder scopes the open file list to that path; opening a file keeps the next folder dialog rooted in the selected directory.
- [x] **Step 2: Run the focused tests and confirm they fail** — `./scripts/e2e-playwright.sh e2e/host-desktop.spec.ts --grep "MarkWisely"`; confirmed the path regression in the browser (the next picker showed `/home/e2e/note.md`).
- [x] **Step 3: Implement the shared folder-dialog flow** — Use `view` states for new-folder selection, create form, open-folder selection, and file selection. Pass a selected folder as the file picker `initialPath`. Render directory picker as `role="dialog" aria-modal="true"`; use `Folder`/`FolderOpen` icons from already installed lucide-react for folder entries and chooser action. Only directory selection updates the remembered parent folder.
- [x] **Step 4: Run focused MarkWisely tests** — Verified both entry paths, cancel, creation/save/reopen, Markdown-only listing, dirty-document protection and remembered directory behavior pass.
- [x] **Step 5: Commit** — `git add` only this plan, the listed source/test files, then commit as `feat: choose MarkWisely folders in dialogs`.

## 完成验证

- [x] `node scripts/check-no-agent-hardcoding.mjs`
- [x] `./scripts/run-all-tests.sh`
- [x] Confirm all Playwright MarkWisely folder and file-selection paths pass.

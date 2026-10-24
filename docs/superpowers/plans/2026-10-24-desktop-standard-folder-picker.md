# Desktop 标准文件夹选择框实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MarkWisely's New/Open folder dialogs use the same path toolbar, breadcrumb, list rows, and folder icons as the Desktop file manager.

**Architecture:** Keep MarkWisely's remote-directory listing and selection flow, but render it with the established Desktop file view components and CSS classes. Use `LocalFsPathBreadcrumb` and `LocalFsEntryIcon` for consistent navigation and folder presentation; keep the modal actions and accessible dialog semantics owned by `MarkWiselyFilePicker`.

**Tech Stack:** React, TypeScript, lucide-react/local filesystem icon components, Playwright.

**Spec:** User request in this turn; visual reference is `LocalFsPanel`'s embedded Desktop file manager.

## Global Constraints

- The picker continues to browse the active SSH host's remote folders.
- New Markdown continues to return to the existing filename form; Open Markdown remains scoped to the selected folder and Markdown files.
- Keep current cancel, loading/error, save, and dirty-document behavior.
- Do not add dependencies or unrelated file-manager actions.

## Review Focus

- Deep paths remain horizontally navigable through Desktop's breadcrumb behavior.
- Loading and errors remain visible within the modal, with the confirm action disabled when no folder listing is available.
- Folder entries retain an identifiable folder icon and keyboard focus outline.
- Small windows keep the path controls and confirm/cancel buttons accessible without horizontal overflow.

---

## 要保住的旧行为

- Choosing a folder from New Markdown opens the filename form with that remote folder selected.
- Choosing a folder from Open Markdown scopes its Markdown-only list to that remote folder.
- Cancel returns to the previous MarkWisely view; selecting a file does not overwrite the remembered folder path.
- Parent navigation, remote loading/error feedback, and keyboard operability remain available.

## 架构

| File | Responsibility |
|------|----------------|
| `src/components/desktop/MarkWiselyFilePicker.tsx` | Retain remote listing and selection state; adopt Desktop breadcrumb, toolbar, list row and folder/file icon components. |
| `src/components/desktop/MarkWiselyWindow.css` | Size the shared Desktop picker structure inside the MarkWisely modal and preserve responsive scrolling/focus. |
| `e2e/host-desktop.spec.ts` | Assert the folder dialog uses the Desktop path toolbar/list conventions and preserves New/Open selection flow. |

Dependency direction stays MarkWiselyWindow → MarkWiselyFilePicker → remote directory command and shared Desktop file-view components. No backend/store changes are needed.

## 设计

- Opening either folder chooser shows a centered Desktop-style dialog.
- The dialog header contains Cancel, the dialog title, and the folder confirmation action.
- A compact Desktop toolbar contains parent navigation, refresh, and the same clickable path breadcrumb used by Desktop Files.
- The body uses Desktop list headers/rows. Directory rows use the filled yellow Desktop folder icon; Markdown files use the standard Desktop document icon.
- Loading, empty, and error feedback remain inside the list body. The folder confirmation action stays disabled while loading or after an error.

## Tasks

### Task 1: Match the MarkWisely folder picker to Desktop Files

**Files:**
- Modify: `src/components/desktop/MarkWiselyFilePicker.tsx`
- Modify: `src/components/desktop/MarkWiselyWindow.css`
- Test: `e2e/host-desktop.spec.ts`

- [x] **Step 1: Write failing Playwright coverage** — Assert the folder dialog has the Desktop toolbar, clickable path breadcrumb, standard file list header/rows, and the Desktop folder icon while both New/Open flows still select the requested folder.
- [x] **Step 2: Run the focused test and confirm it fails** — `./scripts/e2e-playwright.sh e2e/host-desktop.spec.ts --grep "MarkWisely"`; confirmed the original picker lacked Desktop toolbar classes.
- [x] **Step 3: Reuse Desktop file-view components/styles** — Use `LocalFsPathBreadcrumb`, `LocalFsEntryIcon`, and established Desktop toolbar/list classes, with picker-specific accessible labels and action layout.
- [x] **Step 4: Run focused MarkWisely tests** — Verified dialog styling structure, folder navigation, New/Open flows, cancel, filtering, and dirty-document protection.
- [x] **Step 5: Commit** — Commit only the plan and listed implementation/test files as `style: match MarkWisely picker to desktop files`.

## 完成验证

- [x] `node scripts/check-no-agent-hardcoding.mjs`
- [x] `./scripts/run-all-tests.sh`
- [x] Confirm focused MarkWisely Playwright paths pass.

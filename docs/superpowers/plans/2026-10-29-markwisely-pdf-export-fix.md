# MarkWisely PDF Export Fix Implementation Plan

> **For agentic workers:** Use the current repository workflow and execute each task in order. Each implementation step follows test-first.

**Goal:** Make PDF export visibly usable and invoke printing only from an explicit user action, while keeping exported files on the computer running TerminalWisely.

**Architecture:** Keep Markdown-to-print-HTML rendering in `markWiselyExport.ts`. Replace the invisible iframe's automatic print-on-load behavior in `MarkWiselyWindow.tsx` with a visible in-app print preview and an explicit print action. HTML and DOCX continue using the Tauri native save dialog and local filesystem commands; in Hosts, the document source remains remote while the exported output is local.

**Tech Stack:** React, Tauri WebView, CSS, Playwright.

**Spec:** Follow-up bug fix for `docs/superpowers/plans/2026-10-29-markwisely-rich-export.md`.

## Global Constraints
- Keep SSH MarkWisely source reads and saves routed to the selected SSH host.
- HTML, PDF and DOCX export only; do not add Markdown export.
- Export destination is the local computer running TerminalWisely.
- Preserve print CSS, CJK font fallbacks, and document formatting.

## Review Focus
- Exporting PDF must first show a visible preview rather than silently printing an offscreen iframe.
- The system print dialog must only be invoked after an explicit user click.
- Closing PDF preview must return to the editor without losing the active document.
- Hosts export must keep remote source content while selecting a local output destination.

---

### Task 1: Explicit PDF preview and print action

**Files:**
- Modify: `src/components/desktop/MarkWiselyWindow.tsx`
- Modify: `src/components/desktop/MarkWiselyWindow.css`
- Modify: `src/i18n/locales/en/tools.json`
- Modify: `src/i18n/locales/zh-CN/tools.json`
- Modify: `e2e/host-desktop.spec.ts`

**Interfaces:**
- `renderMarkdownPrintHtml(markdown, title)` remains the source of print-ready document HTML.
- The preview exposes `markwisely-pdf-preview`, `markwisely-pdf-print`, and `markwisely-pdf-close` test IDs.
- The print action calls the preview iframe's `contentWindow.print()` from a direct button click. Iframe load does not call print.

- [x] **Step 1: Write failing Playwright assertions** in the existing MarkWisely export test: preview is visible; print button is available; print is not invoked during iframe load; clicking print invokes it once; close returns to editor.
- [x] **Step 2: Run** `npm run test:e2e -- --grep 'MarkWisely export'`; confirm it fails because the current iframe is offscreen and prints automatically on load, with no visible preview controls.
- [x] **Step 3: Implement** a visible preview overlay with localized “Print / Save as PDF” and “Back to editor” controls. Only the print control calls `contentWindow.print()`; remove the load callback print invocation. Keep the print document CSS unchanged.
- [x] **Step 4: Run** `npm run test:e2e -- --grep 'MarkWisely export'` and `npm run build`; confirm visible preview, explicit print call, and close behavior pass.
- [ ] **Step 5: Commit** the UI, localization, and E2E changes as one task commit.

### Task 2: Coverage record and full verification

**Files:**
- Modify: `docs/TEST_MATRIX.md`

- [ ] **Step 1: Update** the MarkWisely row to record explicit PDF preview/print behavior and local export destination semantics.
- [ ] **Step 2: Run** `node scripts/check-no-agent-hardcoding.mjs` and `./scripts/run-all-tests.sh`; confirm all automated suites pass.
- [ ] **Step 3: Commit** the matrix update, then push the completed commits to `origin main` per repository policy.

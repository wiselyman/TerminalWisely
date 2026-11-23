# Markdown Preview Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make relative file links in SSH Markdown previews open as preview tabs and remove the misleading WYSIWYG search hint.

**Architecture:** Add a small pure resolver for Markdown link targets, then let `PreviewPanel` route local document links through the existing preview store. Vditor remains responsible for rendering Markdown and native in-document anchors; external URLs keep their existing browser behavior.

**Tech Stack:** React, TypeScript, Zustand, Vditor, Vitest, Playwright.

**Spec:** User request and screenshot in this conversation.

## Global Constraints

- Resolve relative paths against the currently previewed Markdown file.
- Opening a linked file adds/activates a preview tab and keeps the source document tab available.
- In-document fragment links remain in the current document.
- Remove the “Switch to Source for advanced search” hint in all locales.

## Review Focus

- Relative path containing parent segments resolves within the expected POSIX directory.
- External schemes and fragment-only links are not treated as file paths.
- Encoded spaces and Unicode remain valid filesystem path characters.
- Source and WYSIWYG mode toggles continue to work after links are clicked.
- The search hint is absent while WYSIWYG Markdown search is available.

---

## 要保住的旧行为

- Clicking a fragment link keeps the current preview tab active and targets the matching in-document anchor.
- Clicking an external Markdown URL continues to use the browser’s normal external-link behavior.
- Switching between Source and WYSIWYG preserves the current Markdown contents.
- Existing preview tabs for the same session remain selectable after opening another file.

## 架构

- Add `src/lib/markdownLink.ts` to resolve relative Markdown targets and `src/lib/markdownLink.test.ts` for path classification.
- Add optional link handling to `src/components/preview/MarkdownWysiwygEditor.tsx`; `src/components/PreviewPanel.tsx` will call the existing `openPreview` store action for resolved targets.
- Remove the obsolete search hint render and locale strings from `PreviewPanel.tsx` and `src/i18n/locales/{en,zh-CN}/preview.json`.
- Extend `e2e/preview-markdown-wysiwyg.spec.ts` and the E2E mock fixture to cover opening a sibling Markdown file in a new preview tab and absence of the hint.

## 设计

- Click a relative Markdown link: the linked file opens in a new/activated tab in the existing preview dock; the current document remains available as another tab.
- Click a fragment link: scroll within the current document without opening a tab.
- Click an external URL: keep normal external navigation behavior.
- Search in WYSIWYG: show only actual matches and controls; do not show instructional text in the title row.
- Loading, success, and failure use the existing preview loading state, preview tab, and toast error feedback.

## Tasks

### Task 1: Resolve Markdown document links

**Files:** Create `src/lib/markdownLink.ts` and `src/lib/markdownLink.test.ts`.

- [x] Write tests for relative, parent-relative, fragment-only, external, and percent-encoded links.
- [x] Run `npm test -- --run src/lib/markdownLink.test.ts`; confirmed the missing resolver failed to import.
- [x] Implement the pure target resolver using the current Markdown path as the base.
- [x] Run the focused Vitest file and confirm it passes.

### Task 2: Open linked files in preview tabs and remove hint

**Files:** Modify `src/components/preview/MarkdownWysiwygEditor.tsx`, `src/components/PreviewPanel.tsx`, `src/i18n/locales/en/preview.json`, `src/i18n/locales/zh-CN/preview.json`, `src/e2e/tauriCoreMock.ts`, `src/e2e/preview-markdown-wysiwyg.spec.ts`.

- [x] Add Playwright regressions for a relative file link, a fragment link, and the removed WYSIWYG hint.
- [x] Run the new Playwright coverage before implementation; the hint was present and clicking a file link did not create an in-app preview tab.
- [x] Intercept Markdown links through Vditor's link callback; route file targets through `openPreview`, preserve fragment navigation, and send external targets to the system opener.
- [x] Remove the obsolete hint markup, locale entries, and CSS.
- [x] Run the focused Playwright spec (4 passed), unit tests (4 passed), and TypeScript production build; refresh the light/dark preview screenshot baselines to reflect the removed hint.

### Task 3: Repository verification

- [x] Run `node scripts/check-no-agent-hardcoding.mjs`.
- [x] Run `./scripts/run-all-tests.sh` and record its passing output.
- [x] Commit the completed tasks on `main` with the configured author and push `origin main`.

## Verification Record

- Initial RED: Vitest import failed because `markdownLink.ts` did not yet exist.
- Initial RED: Playwright showed the search hint and verified relative links did not open a preview tab.
- Green: focused resolver tests passed (4 tests), focused Markdown preview Playwright suite passed (4 tests), and `npm run build` passed.
- `node scripts/check-no-agent-hardcoding.mjs`: PASS (7 rules, 92 Python files).
- `git diff --check`: PASS.
- `./scripts/run-all-tests.sh`: all 9 stages passed; Playwright 143 passed. Smoke reported 234 PASS, 0 FAIL, and one existing optional native titlebar check as BLOCKED because it requires a display.
- Commits: `317641c8` (resolver/tests), `ebefa773` (preview behavior/UI tests/baselines), and this plan record.
- Push is pending.

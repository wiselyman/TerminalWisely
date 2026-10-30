# MarkWisely Picker Title Bar Implementation Plan

**Goal:** Make the Open Markdown file and Choose folder dialogs use a compact, centered title bar.

**Architecture:** Keep the shared title bar in `MarkWiselyFilePicker` and its styles in the existing MarkWisely stylesheet. Use a three-column layout with fixed icon-button slots on both sides so both dialog modes center their title consistently.

**Tech Stack:** React, CSS, Playwright.

## 要保住的旧行为

- The Open Markdown file and Choose folder dialogs keep their existing dialog roles, translated names, and folder navigation.
- Cancel closes either dialog; Use this folder selects the displayed folder and remains disabled while listing is unavailable.
- The icon-only Cancel and Use this folder buttons retain their accessible labels and hover titles.

## 架构

- `src/components/desktop/MarkWiselyFilePicker.tsx`: keep the existing shared header structure and accessible dialog actions; the grid reserves both title-side slots without changing picker behavior.
- `src/components/desktop/MarkWiselyWindow.css`: make the picker header a compact, full-width title bar with a centered title and smaller fixed-size icon controls.
- `e2e/host-desktop.spec.ts`: assert the centered title and reduced header height in both picker modes.
- No new shared component or dependency is needed; the picker is the common owner for both modes.

## 设计

- The dialog title is centered horizontally in the header, independent of left and right controls.
- The title bar is about 40 CSS pixels high with 32-pixel icon buttons, reducing the current visual height while preserving usable hit targets.
- The header has a subtle bottom separator and spans the dialog width. Folder list and navigation remain below it.
- Loading, success, and error behavior does not change.

## Review Focus

- File mode has no primary action, but its title must still remain centered using the reserved right slot.
- Directory mode has both side actions; title center must not shift when either button is present.
- Long localized titles must remain inside the titlebar without overlapping icon controls.
- Smaller controls must retain focus rings and existing accessible names.
- The title bar must remain usable within the modal's narrow responsive width.

## Tasks

### Task 1: Center and compact the shared picker title bar

**Files:**
- Modify: `src/components/desktop/MarkWiselyFilePicker.tsx`
- Modify: `src/components/desktop/MarkWiselyWindow.css`
- Test: `e2e/host-desktop.spec.ts`

- [x] Add E2E assertions that file and folder picker titles sit at the header's horizontal center and the header is at most 40 CSS pixels high.
- [x] Run the focused picker E2E and confirm it fails against the current left-aligned, taller layout.
- [x] Reserve matching left/right slots, center the title, and reduce header/button dimensions while preserving focus and dialog actions.
- [x] Run the focused picker E2E and confirm both modes pass.
- [x] Run `node scripts/check-no-agent-hardcoding.mjs` and `./scripts/run-all-tests.sh`.

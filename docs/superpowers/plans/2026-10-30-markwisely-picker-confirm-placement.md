# MarkWisely Picker Confirm Action Placement

**Goal:** Make the Choose folder confirmation action feel integrated with folder navigation instead of isolated in the title bar.

**Architecture:** Keep both picker modes in `MarkWiselyFilePicker`. Move the existing Use this folder button from the title bar into the navigation toolbar beside the up/refresh controls, and style it as a compact toolbar action with its existing accessible label and tooltip. No backend or dialog behavior changes.

**Tech Stack:** React, CSS, Playwright.

## 要保住的旧行为

- Choose folder keeps its centered compact title bar and still selects the currently displayed directory.
- Use this folder remains disabled while listing is loading, missing, or failed.
- Cancel, path navigation, refresh, and Open Markdown file behavior remain unchanged.
- The confirmation control remains keyboard-accessible and exposes its localized accessible name and hover title.

## 架构

- `src/components/desktop/MarkWiselyFilePicker.tsx`: relocate the existing directory confirmation button into the toolbar action group without changing its handler or disabled condition.
- `src/components/desktop/MarkWiselyWindow.css`: style the confirmation control as a compact toolbar action, preserving visible focus and hover states.
- `e2e/host-desktop.spec.ts`: assert the title bar no longer contains the confirmation button and the toolbar contains the accessible action.
- Keep all changes within the shared picker; no new component or dependency is needed.

## 设计

- Choose folder's title bar contains only the close control and centered title, matching Open Markdown file.
- Place the folder confirmation icon alongside the up and refresh controls in the navigation toolbar, where it reads as an action on the currently browsed directory.
- Use the same compact control size and visual weight as neighboring toolbar icons, with an accent color, hover label, and visible keyboard focus.
- Loading, success, and error feedback stay in their existing locations; directory selection semantics do not change.

## Tasks

### Task 1: Integrate directory confirmation into navigation actions

**Files:**
- Modify: `src/components/desktop/MarkWiselyFilePicker.tsx`
- Modify: `src/components/desktop/MarkWiselyWindow.css`
- Test: `e2e/host-desktop.spec.ts`

- [x] Add E2E assertions that Use this folder is in the navigation toolbar, absent from the title bar, and retains its accessible name/title.
- [x] Run the focused picker E2E and confirm it fails against the current titlebar placement.
- [x] Move the existing button into the navigation toolbar beside Up and Refresh; keep its handler and disabled state.
- [x] Apply compact toolbar styling with accent, hover, and focus-visible feedback.
- [x] Run the focused picker E2E and confirm directory and file dialog flows pass.
- [x] Run `node scripts/check-no-agent-hardcoding.mjs` and `./scripts/run-all-tests.sh`.

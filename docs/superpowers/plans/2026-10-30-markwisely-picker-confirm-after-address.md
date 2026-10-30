# MarkWisely Picker Confirm After Address Bar

**Goal:** Place the Choose folder confirmation action immediately after the path address bar.

**Architecture:** Keep the shared directory picker and existing confirmation callback. Move the current toolbar button after the address bar and style it as a compact icon action consistent with the picker toolbar.

**Tech Stack:** React, CSS, Playwright.

## 要保住的旧行为

- Choose folder keeps the centered compact title bar and current-directory selection behavior.
- The confirmation control remains disabled while the listing is unavailable, loading, or failed.
- Cancel, path navigation, refresh, Open Markdown file behavior, accessible name, and hover title remain unchanged.

## 架构

- `src/components/desktop/MarkWiselyFilePicker.tsx`: move the existing confirmation button from the navigation action group to immediately after `.local-fs-address-bar`.
- `src/components/desktop/MarkWiselyWindow.css`: preserve a compact, discoverable action style and visible keyboard focus in its new location.
- `e2e/host-desktop.spec.ts`: assert the button follows the address bar in the toolbar while remaining outside the title bar.
- No data, backend, or dialog API changes.

## 设计

- Toolbar order is navigation controls, path address bar, then Use this folder.
- The button sits immediately to the right of the path bar, visually tying selection to the displayed directory.
- Keep the icon small and accented, with existing hover title and a visible keyboard focus ring.
- Loading, success, and error feedback remain unchanged.

## Tasks

### Task 1: Place folder confirmation after the address bar

**Files:**
- Modify: `src/components/desktop/MarkWiselyFilePicker.tsx`
- Modify: `src/components/desktop/MarkWiselyWindow.css`
- Test: `e2e/host-desktop.spec.ts`

- [x] Assert the confirmation action is outside the title bar and is the next toolbar element after the address bar.
- [x] Run the focused picker E2E and observe failure against the current position inside the navigation action group.
- [x] Move the existing button after the address bar while keeping its callback, disabled condition, accessible name, and title.
- [x] Keep the compact accent and focus-visible styling suitable for the path toolbar.
- [x] Run the focused picker E2E and confirm the directory selection flow passes.
- [x] Run `node scripts/check-no-agent-hardcoding.mjs` and `./scripts/run-all-tests.sh`.

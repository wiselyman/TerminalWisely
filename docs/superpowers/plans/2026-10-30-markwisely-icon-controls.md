# MarkWisely Icon Controls Implementation Plan

**Goal:** Make folder-picker actions icon-first and ensure MarkWisely toolbar icons expose clear hover labels.

**Architecture:** Keep the folder picker and Vditor toolbar as the existing UI owners. The picker will use Lucide icon buttons with localized accessible names and native hover titles; custom Vditor toolbar actions will retain their Vditor tooltip and also receive a native title.

**Tech Stack:** React, TypeScript, Lucide React, Vditor, Playwright.

## 要保住的旧行为

- Clicking Cancel in either MarkWisely picker closes that picker without selecting a path.
- Clicking Use this folder selects the currently displayed directory and enables the existing create/open flow.
- MarkWisely toolbar actions remain in the order Open, Open Folder, Save, Save As, Export and preserve their current behavior.
- Each toolbar action remains discoverable by its localized accessible name and displays that name on hover.

## 架构

- `src/components/desktop/MarkWiselyFilePicker.tsx`: replace text-only Cancel/Use this folder controls with icon-only buttons; retain localized `aria-label` and add `title`.
- `src/components/desktop/MarkWiselyWindow.css`: style icon-only picker controls with consistent hit areas, hover and focus states.
- `src/components/preview/MarkdownWysiwygEditor.tsx`: ensure generated MarkWisely toolbar buttons receive native `title` values matching the existing Vditor tooltip labels.
- `e2e/host-desktop.spec.ts`: extend folder-picker and toolbar interaction coverage; no new dependencies or component split is needed.

## 设计

- Folder selection dialogs use an X icon for Cancel and a folder-check icon for Use this folder. Both controls show a concise localized function label on hover and keep accessible names for assistive technology.
- Toolbar actions use the existing standard icons. Hovering each icon shows its localized function label. Keyboard focus retains the current visible focus ring.
- Loading and error states, folder navigation, and selection behavior remain unchanged.

## Review Focus

- Narrow or translated layouts: icon buttons must not overlap the dialog title; flex sizing keeps the title readable.
- Loading/error states: Use this folder remains disabled when no valid directory result exists.
- Keyboard use: icon-only controls retain accessible names and visible focus.
- Tooltip compatibility: both Vditor's tooltip and native title provide the same action label.
- Existing file-mode Cancel and directory-mode selection paths remain unchanged.

## Tasks

### Task 1: Icon-first folder picker controls

**Files:**
- Modify: `src/components/desktop/MarkWiselyFilePicker.tsx`
- Modify: `src/components/desktop/MarkWiselyWindow.css`
- Test: `e2e/host-desktop.spec.ts`

- [x] Add Playwright assertions that Cancel and Use this folder contain the intended Lucide icons, have no visible text, and expose localized `aria-label` and `title` values.
- [x] Run the focused picker E2E and confirm it fails because the current controls are text buttons without those icon/title attributes.
- [x] Replace the button text with X and FolderCheck icons while preserving their click and disabled behavior; style consistent icon hit areas and focus states.
- [x] Rerun the focused picker E2E and confirm it passes.

### Task 2: Native hover labels for toolbar icons

**Files:**
- Modify: `src/components/preview/MarkdownWysiwygEditor.tsx`
- Test: `e2e/host-desktop.spec.ts`

- [x] Extend the existing toolbar E2E to assert each custom action button has a `title` equal to its accessible label, in addition to the Vditor hover tooltip assertion.
- [x] Run the focused toolbar E2E and confirm it fails because the custom toolbar buttons currently lack `title` attributes.
- [x] Add native titles to generated custom toolbar buttons, using their existing localized `aria-label`/Vditor tooltip labels without changing action behavior.
- [x] Rerun the focused toolbar E2E and confirm it passes.

### Task 3: Full verification and test matrix

**Files:**
- Modify: `docs/TEST_MATRIX.md`

- [x] Update the MarkWisely test-matrix row to mention icon-only folder-picker controls and toolbar hover labels.
- [x] Run `node scripts/check-no-agent-hardcoding.mjs`.
- [x] Run `./scripts/run-all-tests.sh` and confirm the full suite passes.

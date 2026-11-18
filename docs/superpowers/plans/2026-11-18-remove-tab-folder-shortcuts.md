# Remove Tab Folder Shortcuts Implementation Plan

> **For agentic workers:** Execute this plan task by task in the current session. Each task uses checkbox syntax.

**Goal:** Remove the per-host-tab home-folder and directory-shortcut controls and their tab-only shortcut feature.

**Architecture:** Remove the controls from the SSH tab action cluster in `App.tsx`, including the `enter_directory` callback used by the tab home icon. The directory shortcut menu, its store, path label helper, types, localization, and tab-only CSS have no other product callers, so remove those dead feature modules and their wiring while keeping the global Home launcher and host directory behavior intact.

**Tech Stack:** React, TypeScript, Zustand, Vitest, Playwright.

**Spec:** User request and screenshot annotations: remove the home-folder and plus/folder shortcut controls shown inside the active host tab.

## Global Constraints

- Remove only per-tab folder navigation and shortcut management.
- Preserve the global Home icon, Local Desktop tab, SSH tab selection/close/reorder, and Files app.
- Do not clear or mutate user storage as a side effect of removing the UI.

## Review Focus

- Active SSH tabs must have no home-folder or add-shortcut controls: cover the live active tab in Playwright.
- Removing the shortcut component must not remove the global Home launcher: keep an assertion for the launcher.
- Removing the home-folder action must not break normal SSH terminal navigation: preserve the terminal view in the existing host workspace tests.
- The Files app must remain available: retain existing Desktop Files E2E coverage.
- Light and dark host-tab chrome must reflect the removed controls: update the SSH Desktop visual baselines.

## 要保住的旧行为

- Clicking a saved host card still authenticates and opens that host's SSH Desktop tab.
- The global Home icon still opens the saved-host directory.
- SSH tab close, reorder, and active-session behavior remain unchanged.
- Files remains available inside the SSH Desktop and local Desktop.
- Local Desktop remains pinned first and retains its own filesystem state.

## 架构

| 职责 | 文件 |
|---|---|
| Tab controls and Home routing | `src/App.tsx`: remove active-tab home-folder and `TabDirectoryShortcuts` controls plus their single-use `enter_directory` callback; leave global Home icon routing intact. |
| Shortcut-only implementation | Delete `src/components/TabShortcutMenu.tsx`, `src/stores/directoryShortcutStore.ts`, and `src/lib/shortcutPathLabel.ts`; remove `DirectoryShortcut` types from `src/types/index.ts`. |
| Styling and copy | `src/App.css`, `src/i18n/locales/en/shell.json`, `src/i18n/locales/zh-CN/shell.json`, `scripts/generate-i18n-locales.mjs`: remove tab-only controls, menus, and their labels. |
| Regression coverage | `src/App.homeTab.test.ts`, `e2e/home-host-directory.spec.ts`, `e2e/ui-visual-baselines.spec.ts`, and `scripts/smoke-product-checklist.mjs`. |
| Baselines | `e2e/ui-visual-baselines.spec.ts-snapshots/hosts-{dark,light}-chromium-darwin.png` and `local-files-{dark,light}-chromium-darwin.png`. |

Dependencies: SSH tab chrome depends only on the session tab store; the global Home launcher continues using session and managed-entity stores. No directory-shortcut store remains because it has no callers outside the tab menu.

## 设计

- An active SSH tab displays its OS icon, host title, and close control; the Home-folder and folder-plus controls are absent.
- Clicking the global Home icon continues to show the host directory.
- Loading, terminal output, Desktop, and Files behavior do not change.
- No shortcut menu or dialog can be opened from an SSH tab.

## 任务

### Task 1: Add failing regression coverage

- [x] Add static and Playwright assertions that an active SSH tab has no folder controls or shortcut menu while the global Home icon remains available; run the focused tests and confirm failure.

### Task 2: Remove tab-only shortcut implementation

- [x] Remove the tab Home and shortcut controls and the one-use `enter_directory` handler from `App.tsx`.
- [x] Delete the shortcut component, store, helper, and unused types; remove their styles and localized strings from the generator and generated locale files.
- [x] Update smoke wiring, SSH Desktop snapshots, and focused regression tests.
- [x] Run focused Vitest, Playwright, smoke, and hardcoding checks.

### Task 3: Full verification and release

- [x] Run `./scripts/run-all-tests.sh` and require all automated tests to pass.
- [x] Commit on `main` as `Yunfei Wang <wiselyman2008@gmail.com>` and push `origin main`.

# Pin Local Desktop and Home Launcher Implementation Plan

> **For agentic workers:** Execute this plan task by task in the current session. Each task uses checkbox syntax.

**Goal:** Replace the Home tab with a Home icon, remove the Local entry from the Home host directory, and keep one Local Desktop tab pinned before SSH tabs.

**Architecture:** Keep Home directory and Local Desktop as the two local views already owned by `managedEntityStore`, but make navigation chrome represent them differently: a Home icon button opens the directory and a single non-closeable Local Desktop tab always occupies the first workspace position. `HomeHostDirectory` will render saved host groups only. Existing SSH connection and Desktop target stores remain unchanged.

**Tech Stack:** React, TypeScript, Zustand, Vitest, Playwright.

**Spec:** User request and screenshot annotations: remove the Local card from Home; fix Local Desktop as the first tab; show Home as an icon at the existing leftmost position instead of a tab.

## Global Constraints

- The Home host catalogue keeps existing groups and host ordering.
- Clicking Home shows the saved host directory without creating a session.
- The Local Desktop tab remains a single pinned tab and keeps the existing Local terminal PTY and target state.
- SSH Desktop tabs remain closable, reorderable, and independent.

## Review Focus

- Home must remain reachable while SSH sessions exist: test its icon from an active SSH Desktop.
- Local Desktop must not duplicate or disappear after switching: test repeated activation and position.
- Removing Local from the directory must preserve saved host groups and counts: cover empty and populated groups.
- Switching Home/Local/SSH must preserve correct active rendering: cover the navigation sequence.
- Existing Home cards must not create SSH sessions: verify saved-host activation counts still change only for saved hosts.

## 要保住的旧行为

- Clicking a saved host card still authenticates through the saved connection and opens that host's Desktop tab.
- Clicking Home returns to the saved host directory without opening or closing an SSH session.
- Local Desktop uses the existing local terminal PTY and stays isolated from SSH sessions.
- SSH tabs keep their current close and reorder behavior.
- Home groups retain their configured order, host order, labels, and empty-group states.

## 架构

| 职责 | 文件 |
|---|---|
| Home section data/rendering | `src/components/home/HomeHostDirectory.tsx`: remove the synthetic Local section and Local callback/card; keep saved groups and host cards. |
| Home/Local tab state | `src/stores/managedEntityStore.ts`: initialize one fixed Local Desktop entry, make open/activate idempotent, and prevent closing that pinned entry. |
| Titlebar navigation | `src/App.tsx`, `src/App.css`: replace the Home tab with an icon button at the same leading position, render Local Desktop as the first non-closeable workspace tab before SSH tabs, and keep Home directory and local workspace routes separate. |
| Removed Local copy/styles | `src/i18n/locales/en/shell.json`, `src/i18n/locales/zh-CN/shell.json`, `src/styles/home.css`: remove labels and styles used only by the removed Local card. |
| Regression coverage | `src/components/home/HomeHostDirectory.test.ts`, `src/stores/managedEntityStore.test.ts`, `src/App.homeTab.test.ts`, `e2e/home-host-directory.spec.ts`, `e2e/app-shell.spec.ts`, `e2e/ui-visual-baselines.spec.ts`. |
| Product notes | `README.md`, `README.zh-CN.md`, `docs/HANDOFF.md`, `docs/TEST_MATRIX.md`, `scripts/smoke-product-checklist.mjs` only where current descriptions/checks refer to Home as a tab or Local as a Home card. |

Dependencies: Home directory uses saved-connection/group data only; the fixed Local tab uses the existing Home workspace state and `DesktopStore`; SSH tabs continue to use session state.

## 设计

- The leftmost Home control is a Home icon button, not a tab. Clicking it shows the host directory and highlights the icon.
- A single Local Desktop tab always follows the Home icon and precedes all SSH tabs. It has no close control and opens the existing Local Desktop workspace when selected.
- Home directory starts with configured host groups; there is no Local heading or “This computer” card.
- Loading and empty-group copy remain in their current group sections. Saved host cards retain the existing connect/authentication flow.
- The active Home icon and Local/SSH tab styles follow the current theme and remain keyboard accessible.

## 任务

### Task 1: Lock directory and navigation behavior

- [x] Update Vitest assertions so Home sections contain saved groups only and local desktop tab state is singleton and non-closeable; run the focused tests and confirm failure.
- [x] Update Playwright assertions for icon-only Home, fixed Local Desktop ordering before SSH, no Local card/group, and Home/Local/SSH switching; run affected tests and confirm failure.

### Task 2: Implement the fixed Home and Local navigation

- [x] Remove the synthetic Local section/card from `HomeHostDirectory` and update its tests.
- [x] Make the Local Desktop entry singleton and pinned in `managedEntityStore`; update state tests.
- [x] Replace Home tab markup with an icon button and render the fixed Local Desktop tab before SSH tabs in `App.tsx`; remove its close action while preserving activation and local PTY continuity.
- [x] Update affected E2E tests, visual baselines, smoke checks, and product docs.
- [x] Run focused Vitest, Playwright, and smoke checks.

### Task 3: Full verification and release

- [x] Run `node scripts/check-no-agent-hardcoding.mjs` and `npm run test:smoke`.
- [x] Run `./scripts/run-all-tests.sh` and require all automated tests to pass.
- [ ] Commit on `main` as `Yunfei Wang <wiselyman2008@gmail.com>` and push `origin main`.

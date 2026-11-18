# Home Directory Tab Alignment Implementation Plan

**Goal:** Match the annotated 0.1.3 screenshot by making Home a fixed titlebar tab, simplifying the directory, and preserving Local Desktop as a separate Desktop tab.

**Architecture:** Keep the Home directory and its grouping data in `HomeHostDirectory`; move Home navigation into the existing titlebar tab bar and leave SSH session tabs and Local Desktop tabs on their current stores. Remove the scope icon group and directory-only heading/actions called out in the screenshot.

**Tech Stack:** React, TypeScript, Zustand, Vitest, Playwright.

**Spec:** User screenshot annotations and request “按照截图的要求理解修改”.

## Global Constraints

- Keep work on `main`; do not create a feature branch or PR.
- Preserve saved-host grouping/order, existing SSH connection/authentication, Local Desktop target isolation, and local Terminal/chat access through tabs.
- Do not add hardcoded host or software data.
- Run the relevant tests, `node scripts/check-no-agent-hardcoding.mjs`, and `./scripts/run-all-tests.sh`.

## 要保住的旧行为

- Selecting a saved host still uses the saved-connection authentication flow and opens a Desktop workspace bound to that new SSH session.
- The Hosts scope icon still opens the connection sidebar whenever a workspace tab is active, so users can add and manage saved hosts.
- Selecting Local still creates an independent Local Desktop tab and does not invoke SSH.
- Existing Local Terminal tabs and Home chat scope remain usable; closing or switching tabs does not change SSH session ownership.
- Host groups and host order remain sourced from the current entity layout; no host is dropped when the directory header is removed.

## 架构

| 职责 | 文件 |
|---|---|
| Simplified host directory | `src/components/home/HomeHostDirectory.tsx`: remove title/subtitle and local Terminal/chat buttons; retain Local and grouped host cards. |
| Home titlebar tab and navigation | `src/App.tsx`: render a fixed Home tab before workspace tabs; activate directory on selection; selecting workspace tabs exits Home; hide the scope icon group while Home is active and retain Hosts scope navigation for workspace tabs. |
| Directory copy and Home tab label | `src/i18n/locales/{en,zh-CN}/shell.json`. |
| Regression coverage | `src/components/home/HomeHostDirectory.test.ts`, `e2e/home-host-directory.spec.ts`, and `e2e/app-shell.spec.ts`. |

Dependencies: the fixed Home tab only changes which existing workspace is active. SSH selection continues through `ConnectionPanel` and `SessionStore`; Local Desktop continues through `managedEntityStore` and `DesktopStore`.

## 设计

- The titlebar has a fixed `Home` tab first, followed by Local Terminal/Desktop or SSH session tabs. Remove the scope icon group while the Home directory is active; workspace tabs retain the Hosts icon for opening host management. Clicking Home returns to the grouped directory and hides the sidebar.
- The directory begins with the Local section, then existing host groups. Remove the page heading/subtitle and Local Terminal/chat buttons. The Local card remains; clicking it opens a new tab whose content is the local Desktop.
- Clicking an SSH host continues to create/activate its SSH session tab and show that session's Desktop. Existing terminal/chat entry remains in Local Terminal tabs and existing toolbar actions.
- Loading, empty groups, host counts, and host ordering are unchanged.

## 任务

### Task 1: Simplify HomeHostDirectory

- [x] Write failing component tests asserting the directory omits the heading/subtitle and Local Terminal/chat actions, while preserving Local first and host groups.
- [x] Run `npm test -- --run src/components/home/HomeHostDirectory.test.ts`; confirm the new assertions fail.
- [x] Remove the directory heading/actions and now-unused props/icons.
- [x] Rerun the component test.

### Task 2: Use a fixed Home tab instead of scope icons

- [x] Add Playwright assertions that scope controls are hidden on Home, Home is the first titlebar tab, clicking Home returns to the directory, and Local Desktop still opens in a separate tab.
- [x] Run `npm run test:e2e -- --grep "Home host directory"`; confirm the navigation assertions fail.
- [x] Render the fixed Home titlebar tab and route its click to the Home directory; hide the scope icon group on Home and preserve active Local/SSH tab switching.
- [x] Run the Home directory and app-shell Playwright tests.

### Task 3: Verify and release

- [x] Run `node scripts/check-no-agent-hardcoding.mjs` and `npm run test:smoke`.
- [x] Run `./scripts/run-all-tests.sh`; require all automated tests to pass.
- [ ] Commit on `main` with author `Yunfei Wang <wiselyman2008@gmail.com>` and push `main`.

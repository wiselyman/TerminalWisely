# Desktop-only Tabs and Host Sidebar Removal Implementation Plan

**Goal:** Remove the duplicate Hosts list from the left workspace sidebar and ensure workspace tabs represent Desktop sessions rather than standalone Terminal sessions.

**Architecture:** Keep the Home directory as the saved-host catalogue and keep `ConnectionPanel` only as the existing SSH form/password-dialog owner, with its list collapsed permanently. In `App.tsx`, remove sidebar navigation/collapse controls and Home Terminal tab state/rendering; keep one local Terminal instance as the backing PTY for the Local Desktop Terminal app. Route the titlebar plus to the existing new-host form, and open newly created SSH sessions in Desktop mode. Local and saved SSH cards continue to create Desktop tabs using their existing stores and connection flow.

**Tech Stack:** React, TypeScript, Zustand, Vitest, Playwright.

**Spec:** User request and screenshot annotations: “左侧hosts列表不要了” and “以后不要有专门Terminal的页签了…所有的页签都是desktop.”

## 要保住的旧行为

- Home remains the fixed first tab and shows Local followed by saved SSH hosts in the existing group/order.
- Clicking a saved host still uses saved credentials/password prompt and opens that host's Desktop session.
- Clicking Local opens an isolated Local Desktop; its Terminal app continues using the existing local PTY, without an SSH connection.
- The titlebar plus still lets the user add an SSH host; successful connection creates/selects a Desktop workspace tab.
- Closing or switching Local/SSH Desktop tabs preserves the target-specific app state and session ownership.
- AI Local, SSH AI, files, browser, and desktop apps continue to work in their existing target scopes.

## 架构

| 职责 | 文件 |
|---|---|
| Workspace chrome and session tabs | `src/App.tsx`: remove Hosts sidebar scope/collapse UI; always use the single-column workspace; omit standalone Home Terminal tabs; keep Local Terminal as Desktop's backing PTY; route plus to the SSH form and keep workspace tabs in Desktop mode. |
| SSH form/dialog ownership | `src/components/ConnectionPanel.tsx`: retain form and password dialogs via its collapsed rendering; no host list is mounted in the app shell. |
| Desktop session creation | `src/components/ConnectionPanel.tsx`: after a new SSH connection is saved, activate its tab and open Desktop. |
| E2E app helpers | `src/e2eBootstrap.ts`: provide directory/Desktop states explicitly so tests exercise the public UI model. |
| Regression coverage | `src/App.homeTab.test.ts`, `e2e/app-shell.spec.ts`, `e2e/home-host-directory.spec.ts`, `e2e/home-local-terminal-chat.spec.ts`, `e2e/ssh-connection-ui.spec.ts`, `e2e/ssh-workspace.spec.ts`, and `e2e/ui-visual-baselines.spec.ts`. |
| Product docs and static wiring | `README.md`, `README.zh-CN.md`, `docs/HANDOFF.md`, `docs/TEST_MATRIX.md`, `scripts/smoke-product-checklist.mjs`. |

Dependencies: the Home directory owns host discovery; SSH form and connection state stay in existing session stores; Local Terminal remains owned by `LocalTerminal` and is presented only through the Local Desktop Terminal app. No new host/session store is introduced.

## 设计

- The left Hosts list and its collapse/navigation controls are absent in Home and Desktop workspaces. The Home directory remains the only host catalogue.
- The titlebar contains the fixed Home directory tab followed by Desktop workspace tabs. It never renders a dedicated “Terminal N” tab.
- The plus button opens the existing New SSH Host dialog from any view. Successful creation opens the connected host's Desktop tab. Selecting a host card or Local card also opens a Desktop tab.
- The local Terminal is available from the Local Desktop dock. The local chat is available as AI Local in the Local Desktop. Neither appears as a standalone tab.
- Empty/loading host groups and authentication prompts continue in their existing UI surfaces.

## 任务

### Task 1: Lock the new navigation contract with failing tests

- [x] Update/add Playwright assertions that the Hosts sidebar and collapse control are absent on SSH Desktop, Home renders no Terminal tabs, plus opens the New SSH Host dialog, and Local/SSH Desktop tabs remain switchable.
- [x] Run the affected app-shell, Home directory, SSH connection and local Desktop E2E tests; confirm the new assertions fail before implementation.
- [x] Add Vitest/static assertions for no standalone Home Terminal tab and no sidebar controls in the shell.
- [x] Run the affected Vitest tests and confirm the new assertions fail.

### Task 2: Remove sidebar list and standalone Terminal tabs

- [x] Hide the `ConnectionPanel` list while retaining the registered SSH form/password dialogs; remove sidebar scope/collapse chrome and use a single-column workspace.
- [x] Replace the Home Terminal tab array UI with a single local PTY backing instance; remove add/close Terminal tab behavior.
- [x] Route plus to the registered SSH form and make new SSH sessions open Desktop after connect.
- [x] Update test helpers and existing UI tests to use Home directory cards and Desktop apps; preserve Local Terminal PTY continuity.
- [x] Update smoke wiring, docs, and affected light/dark visual baselines.
- [x] Run affected Vitest and Playwright tests.

### Task 3: Verify and release

- [x] Run `node scripts/check-no-agent-hardcoding.mjs` and `npm run test:smoke`.
- [x] Run `./scripts/run-all-tests.sh`; require all automated tests to pass.
- [ ] Commit on `main` with author `Yunfei Wang <wiselyman2008@gmail.com>` and push `main`.

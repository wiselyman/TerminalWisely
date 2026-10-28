# Home Desktop App Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Files, Browser, and Processes in remote Hosts Desktop while hiding these redundant apps from Home Local Desktop.

**Architecture:** Centralize the target-specific app list in `getDesktopAppsForTarget` so both desktop icons and Dock stay consistent. Keep local backend capabilities intact; only change which apps Home exposes. Update unit and Playwright coverage to assert the target-specific app surface and preserve SSH visibility.

**Tech Stack:** TypeScript, Vitest, Playwright.

**Spec:** User clarification in the 2026-10-28 conversation: local computer already has native file management, browser, and process management; remote Hosts must retain these tools.

## Global Constraints

- Home Local Desktop exposes Terminal, AI Local, and MarkWisely only.
- SSH Hosts Desktop continues to expose Files, Processes, Browser, Terminal, AI Linux, and MarkWisely.
- Do not remove local APIs or change remote behavior.

## Review Focus

- Switching Home to a remote SSH target still shows the three remote administration apps in Dock and desktop icons.
- Home AI Local, Terminal, and MarkWisely remain visible and functional.
- Switching targets does not expose stale app windows from the other target.

---

## 要保住的旧行为

- Home Desktop continues to show Terminal, AI Local, and MarkWisely.
- SSH Desktop continues to show Files, Processes, Browser, Terminal, AI Linux, and MarkWisely.
- Existing per-target state and backend routing are not changed by hiding Home-only app entries.

## 架构

- `src/components/desktop/desktopApps.ts` applies the Local/SSH app visibility rule used by `DesktopDock` and `DesktopIcons`.
- `src/components/desktop/desktopApps.test.ts` verifies app identifiers for Local and SSH targets.
- `e2e/home-local-terminal-chat.spec.ts` verifies rendered Home Dock entries; `e2e/host-desktop.spec.ts` verifies remote Dock entries.
- No backend APIs or stores are modified; local file/process/browser capabilities remain untouched.

## 设计

- In Home, opening Desktop shows only Terminal, AI Local, and MarkWisely in the Dock and desktop shortcuts. There are no hidden placeholders for Files, Browser, or Processes.
- In a remote Hosts Desktop, all existing application icons remain available.
- These are synchronous navigation surfaces; removing an app from the Home list is the visible result. Remote operation and error feedback remain unchanged.

### Task 1: Scope Desktop Apps by Target

**Files:**
- Modify: `src/components/desktop/desktopApps.ts`
- Test: `src/components/desktop/desktopApps.test.ts`
- Test: `e2e/home-local-terminal-chat.spec.ts`
- Test: `e2e/host-desktop.spec.ts`

**Interfaces:**
- Consumes: `DesktopTarget` and the existing `getDesktopAppsForTarget(target)` selector.
- Produces: Local target IDs `terminal`, `aiLocal`, `markwisely`; SSH target IDs include `files`, `processes`, `browser`, `terminal`, `aiLinux`, `markwisely`.

- [x] **Step 1: Add failing unit assertions** for exact local app IDs and required SSH app IDs.
- [x] **Step 2: Run the targeted Vitest and confirm RED** because Local currently includes Files, Processes, and Browser.
- [x] **Step 3: Filter Files, Processes, and Browser for Local targets** in `getDesktopAppsForTarget` without changing target state or app definitions.
- [x] **Step 4: Update Playwright coverage** to assert the Home Dock lacks the three entries and SSH Dock retains them; revise Home-only workflows that exercised these removed apps.
- [x] **Step 5: Run targeted Vitest and Playwright tests and confirm GREEN.**
- [x] **Step 6: Run `node scripts/check-no-agent-hardcoding.mjs` and `./scripts/run-all-tests.sh`.**
- [x] **Step 7: Commit** `feat: limit Home desktop apps to local workflows`.

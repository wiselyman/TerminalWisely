# Startup Update Dialog Implementation Plan

> **For agentic workers:** Implement task-by-task with the red-green-refactor sequence.

**Goal:** Show the update dialog automatically after startup when the installed app has a newer signed release.

**Architecture:** Keep the existing four-second startup check in `App.tsx` and update `appUpdateStore.quietCheck` to place an available update in both pending and dialog state. The existing `UpdateAvailableDialog` remains responsible for confirmation and installation.

**Tech Stack:** React, Zustand, Vitest, Playwright.

**Spec:** User request in this conversation; no separate product spec.

## Global Constraints

- Preserve manual update checks and the current download/install confirmation flow.
- No dialog when the app is current, the check fails, or the runtime is not Tauri.
- Do not change update endpoints, signatures, or platform targets.

## Review Focus

- An update is discovered while Home hides the sidebar: the dialog must still open.
- No update is available: startup remains quiet and does not leave a stale update dialog.
- Network/check errors: startup remains usable without a misleading dialog.
- Manual checks continue to open the same update dialog when a release is available.
- Repeated quiet checks update the pending dialog to the latest result rather than retaining stale update data.

## 要保住的旧行为

- 用户手动检查发现更新时，`manualCheck` 将更新写入 `pending` 和 `dialog`，现有升级对话框显示该版本。
- 用户手动检查无更新时，`pending` 与 `dialog` 都清空。
- 安装失败或网络检查失败时，已有更新状态按当前 store 逻辑保留，应用启动不崩溃。

## 架构

- `src/stores/appUpdateStore.ts`：静默检查发现更新后同时设置 `pending` 和 `dialog`；测试覆盖可用更新、无更新、异常三种结果。
- `src/App.tsx`：保留当前约 4 秒的启动检查和非 Tauri 环境短路，不改启动时机。
- `src/components/UpdateAvailableDialog.tsx`：复用现有弹窗和安装确认路径，不新增弹窗实现。
- `src/stores/appUpdateStore.test.ts`：新增 store 单元测试，不改大文件拆分。

## 设计

- 用户启动应用并进入界面后约 4 秒，检查更新。
- 检查到新版本时，现有升级对话框自动出现在应用主界面；用户可在弹窗中确认下载与安装或关闭弹窗。
- 已是最新版本时不显示提示。
- 检查失败时不显示升级弹窗，也不阻断应用操作。

## Tasks

### Task 1: Open the update dialog after a successful startup check

**Files:**
- Create: `src/stores/appUpdateStore.test.ts`
- Modify: `src/stores/appUpdateStore.ts`
- Verify integration: `src/App.tsx`, `src/components/UpdateAvailableDialog.tsx`

**Interfaces:**
- Consumes: `checkForAppUpdate(): Promise<UpdateCheckResult>`
- Produces: `quietCheck(): Promise<void>` sets `{ pending, dialog }` to the same `PendingAppUpdate` when an update is available.

- [x] Write tests for available update opens dialog, no update clears dialog, and check error does not open a dialog.
- [x] Run `npm test -- --run src/stores/appUpdateStore.test.ts` and confirm the available-update case fails because `quietCheck` leaves `dialog` null.
- [x] Implement the minimal store state update.
- [x] Rerun the targeted test and `node scripts/check-no-agent-hardcoding.mjs`.
- [x] Inspect the existing startup flow and dialog wiring to confirm the Home-space case reaches the same dialog.
- [ ] `./scripts/run-all-tests.sh` — implementation-related checks passed; 95 Playwright tests passed and one unrelated visual baseline failed because the masked desktop clock differs by 2 pixels in width. Keep this unchecked until the suite passes.

## Verification status

- Targeted store tests: 3 passed.
- Agent hardcoding check: passed (7 rules, 95 Python files).
- Full suite: blocked by `e2e/ui-visual-baselines.spec.ts` → “Local files and desktop workspace in both themes”; the actual/expected dynamic clock masks are 135px and 131px wide. No snapshot was changed.

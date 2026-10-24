# MarkWisely Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MarkWisely as a Desktop application for creating, opening, editing, saving, and revisiting Markdown files on the current SSH host.

**Architecture:** Extend the existing desktop app registry/store/window lifecycle with a focused MarkWisely component and per-session document store. Reuse remote SFTP/preview commands and the Vditor editor; persist only recent remote paths per SSH session. Keep the existing file-preview editor path intact.

**Tech Stack:** React, TypeScript, Zustand, Tauri invoke, Vditor, i18next, Playwright, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-24-markwisely-design.md`

## Global Constraints

- Keep MarkWisely files and recent paths scoped to the current SSH host session.
- Preserve existing Desktop app launch/focus/minimize/restore/close behavior.
- Preserve existing Markdown preview editing and save behavior.
- Show loading, success, read/write error, and unsaved-leave states within MarkWisely.
- Do not introduce a local file library or persist Markdown contents in recent metadata.

## Review Focus

- Switching SSH sessions while MarkWisely is open must never display/save another host's file; test recent/document session partition.
- Saving while the editor has a newer value must flush the editor value before remote save; test store save receives latest contents.
- Failed file creation/open/save must preserve form or editor contents; test failure states and retained input.
- Closing/switching a dirty document must preserve it when the user cancels confirmation; test cancel path.
- Existing preview editor mounting without MarkWisely must retain current callbacks and behavior; retain/run preview regression tests.

---

### 要保住的旧行为

- Dock 点击任一现有应用仍按原行为启动、聚焦或恢复对应窗口。
- 文件预览打开 Markdown 时仍使用原预览窗口、保存接口和图片处理行为。
- Desktop 当前 SSH session 切换后，现有应用状态恢复到对应 session，不共享远程路径。

### 架构

- `src/stores/desktopStore.ts`、`src/stores/hostWorkspaceMemory.ts`：注册 `markwisely` 应用窗口，使其纳入应用生命周期和 host workspace snapshot。
- `src/components/desktop/desktopApps.ts`、`DesktopDock.tsx`、`DesktopIcons.tsx`：注册 MarkWisely 图标入口；Task 4 的 `src/App.tsx` 按应用 open 状态挂载独立窗口。
- 新建 `src/stores/markWiselyStore.ts`：以 sessionId 分区当前文件、编辑文本、脏状态、保存状态和最近路径；复用 `preview_open`/`preview_save`/`preview_close` 远程接口，不依赖 Preview Store UI 状态。
- 新建 `src/components/desktop/MarkWiselyWindow.tsx`、`MarkWiselyFilePicker.tsx`：分别负责应用开始/编辑窗与远程 Markdown 选择器。
- `src/components/preview/MarkdownWysiwygEditor.tsx`：增加可选编辑值变化/flush 接口，现有 Preview 调用不变。MarkWisely 为每份打开文件保存 `preview_open` 返回的 `handle_id`，保存时使用 `preview_save`，切换/关闭时调用 `preview_close`。
- i18n：仅在 `src/i18n/locales/zh/tools.json`、`en/tools.json` 增加 MarkWisely 文案。
- `e2e/host-desktop.spec.ts` 增加 Dock 入口与创建/编辑/保存/最近打开交互；`src/stores/markWiselyStore.test.ts` 覆盖 session 隔离及保存状态。

### 设计

- Dock 的 MarkWisely 项以本地化名称显示，点击后打开标准 DesktopAppWindow。
- 开始页显示“新建 Markdown”“打开 Markdown”和最近文件；空列表、加载和错误反馈均留在窗口内。
- 新建表单在当前 SSH 主机目录选取位置并输入文件名，成功后进入编辑器并进入最近列表。
- 打开选择器仅列出 Markdown 文件，允许目录导航；成功后进入编辑器并更新最近列表。
- 编辑器复用 Vditor。保存时先从编辑器 flush 最新值，再调用现有远程预览保存命令；保存失败保留文本和 dirty 状态。
- dirty 文档返回、切换文档或关闭窗口时询问是否丢弃；取消后文档保持不变。
- 加载中禁用重复提交；错误显示在当前表单/选择器/编辑区，保留用户输入。

### Task 1: Register MarkWisely in the desktop lifecycle

**Files:**
- Modify: `src/stores/desktopStore.ts`
- Modify: `src/stores/hostWorkspaceMemory.ts`
- Modify: `src/components/desktop/desktopApps.ts`
- Test: `e2e/host-desktop.spec.ts`
- Test: `src/stores/hostWorkspaceMemory.test.ts` (if snapshot assertions live here)

**Interfaces:** Add `"markwisely"` to `DesktopAppId`; include it in idle state and snapshot cloning. Desktop app registry adds icon, label key `desktop.appMarkWisely`, and test id `dock-app-markwisely`. Dock click must update the new app to `data-state="open"`; window mounting is covered in Task 4.

- [ ] **Step 1: Write failing test** asserting the Dock exposes MarkWisely and clicking opens a MarkWisely desktop app window.
- [ ] **Step 2: Run the targeted Playwright test** with `npm run test:e2e -- e2e/host-desktop.spec.ts`; confirm it fails because the app is absent.
- [ ] **Step 3: Implement app registration/lifecycle changes** in the listed store and desktop files, using the existing app window contract.
- [ ] **Step 4: Run the targeted Playwright test** and relevant host workspace snapshot unit test; expect PASS.
- [ ] **Step 5: Commit** only Task 1 files.

### Task 2: Make Chat/Desktop titlebar switching reliable

**Files:**
- Modify: `src/App.tsx` only if click readiness/dispatch is the diagnosed boundary.
- Modify: `src/stores/workspacePanelSwitch.ts` only if state transition ordering is the diagnosed boundary.
- Test: `e2e/host-desktop.spec.ts`
- Test: `src/stores/workspacePanelSwitch.test.ts` if a store transition is the diagnosed boundary.

**Interfaces:** Retain the current Chat and Desktop test IDs. On every enabled Chat or Desktop click, the corresponding workspace must become visible after its state transition and the other workspace must be hidden. First trace whether the missed first click is caused by disabled readiness, target hit testing, or panel transition/state ordering; do not make a speculative fix. Existing E2E test `titlebar Chat and Desktop controls switch in one click` is the starting reproducer.

- [ ] **Step 1: Extend the failing UI regression test** to alternate Chat↔Desktop repeatedly after opening a host session, asserting enabled state and the visible/hidden workspace after each click. Add narrowly scoped diagnostics to the test for the clicked button's `disabled`, `elementFromPoint` hit target, and app panel state if the cycle fails.
- [ ] **Step 2: Run the targeted E2E test repeatedly** (e.g. `npm run test:e2e -- --grep 'titlebar Chat and Desktop controls' --repeat-each=20`); record whether the failure reproduces and where.
- [ ] **Step 3: Trace the confirmed failure boundary** through titlebar readiness/dispatch and workspace transition state. If repeated test does not reproduce, use the UI evidence and avoid a speculative production change; keep the regression coverage and report platform-specific limits.
- [ ] **Step 4: For a reproduced failure, write/retain the smallest assertion that fails before the fix, then implement only the confirmed root cause.** If the expanded test already passes, no production change is authorized by test evidence.
- [ ] **Step 5: Re-run the repeated targeted E2E test** and the relevant unit test; expect all repeated transitions to pass.
- [ ] **Step 6: Commit** only the confirmed transition fix and its regression test (or test-only change if no failure reproduces).

### Task 3: Add per-session MarkWisely document and recent-file state

**Files:**
- Create: `src/stores/markWiselyStore.ts`
- Create: `src/stores/markWiselyStore.test.ts`
- Modify: `src/lib/previewEditorFlush.ts` only if a narrowly scoped generic flush registration is needed; otherwise use existing API.
- Test: `src/stores/markWiselyStore.test.ts`

**Interfaces:** Store actions `activateSession(sessionId)`, `beginDocument({sessionId,path,handleId,text})`, `setEditorValue(sessionId,text)`, `saveDocument(sessionId)`, `closeDocument(sessionId)`, and selectors for session document/recent files. Recent metadata is keyed by session ID and stores path/display name/lastOpened only. `saveDocument` invokes `preview_save` with the active document's `handle_id` and current editor text; `closeDocument` releases the handle with `preview_close`.

- [ ] **Step 1: Write failing store tests** for session-isolated recent paths, dirty state, successful save state, latest editor content being saved, and failed save retaining dirty text.
- [ ] **Step 2: Run `npm test -- --run src/stores/markWiselyStore.test.ts`**; verify expected failures against missing store behavior.
- [ ] **Step 3: Implement minimal store and editor flush bridge**; do not change existing Preview UI semantics.
- [ ] **Step 4: Run the store tests plus `npm test -- --run src/components/preview`**; expect PASS.
- [ ] **Step 5: Commit** only Task 2 files.

### Task 4: Build remote Markdown create/open picker and app screens

**Files:**
- Create: `src/components/desktop/MarkWiselyWindow.tsx`
- Create: `src/components/desktop/MarkWiselyFilePicker.tsx`
- Create: `src/components/desktop/MarkWiselyWindow.test.tsx` (or add focused component tests in current desktop test location)
- Modify: `src/App.tsx`
- Modify: `src/i18n/locales/zh/tools.json`
- Modify: `src/i18n/locales/en/tools.json`
- Test: `e2e/host-desktop.spec.ts`

**Interfaces:** `MarkWiselyWindow({sessionId})` renders a `DesktopAppWindow` for appId `markwisely`, with `start`, `create`, `open`, and `edit` views. `MarkWiselyFilePicker({sessionId,onSelect,onCancel})` lists remote directories via `list_remote_directory` and emits a selected Markdown path. New file creation invokes existing `create_path` then opens it through `preview_open`; opening an existing file also uses `preview_open` and stores returned `handle_id`.

- [ ] **Step 1: Write failing tests** for empty recent state, picker Markdown selection, create/open loading and error feedback, and preserving input after failure.
- [ ] **Step 2: Run targeted Vitest tests**; verify missing-screen failures.
- [ ] **Step 3: Implement start page, remote picker, and create/open actions** in the new focused components.
- [ ] **Step 4: Run targeted Vitest tests and typecheck**; expect PASS.
- [ ] **Step 5: Commit** only Task 3 files.

### Task 5: Integrate Vditor editing, save, recent list, and dirty-leave confirmation

**Files:**
- Modify: `src/components/preview/MarkdownWysiwygEditor.tsx`
- Modify: `src/components/desktop/MarkWiselyWindow.tsx`
- Modify: `src/stores/markWiselyStore.ts`
- Modify: `src/i18n/locales/zh/tools.json`
- Modify: `src/i18n/locales/en/tools.json`
- Test: `e2e/host-desktop.spec.ts`
- Test: `src/components/preview/MarkdownWysiwygEditor.test.tsx` if present; otherwise add focused test.

- [ ] **Step 1: Write failing UI tests** for edit/save round trip, saved/unsaved status, dirty-leave cancel, and same-host recent reopen.
- [ ] **Step 2: Run targeted Playwright/Vitest tests**; confirm expected missing behavior.
- [ ] **Step 3: Integrate editor with the MarkWisely store**, ensuring save flushes the editor’s latest content and failed save preserves it.
- [ ] **Step 4: Run targeted editor/desktop tests**; expect PASS, including existing Markdown Preview regression tests.
- [ ] **Step 5: Commit** only Task 4 files.

### Task 6: Full verification and release documentation

**Files:**
- Modify: `docs/TEST_MATRIX.md` only if a new module entry is appropriate.
- Test: affected store, editor, and desktop E2E suites.

- [ ] **Step 1: Run `node scripts/check-no-agent-hardcoding.mjs`**; expect PASS.
- [ ] **Step 2: Run `./scripts/run-all-tests.sh`**; expect all checks PASS.
- [ ] **Step 3: Inspect Git status/diff** to ensure only MarkWisely work is included; do not add the pre-existing untracked files.
- [ ] **Step 4: Walk the Playwright paths** for Dock launch, remote create/open, edit/save, recent reopen, host isolation, save failure and dirty-leave cancel.
- [ ] **Step 5: Commit** final documentation/test mapping changes if any.

---

## Review Focus Regression Mapping

- Session isolation and session switching: Task 2 tests.
- Latest editor value is flushed before saving: Task 2 and Task 4 tests.
- Failed create/open/save retains user input: Task 3 and Task 4 tests.
- Dirty-document cancel preserves content: Task 4 test.
- Existing Preview editor behavior: Task 2 and Task 4 run existing preview tests.

## Final Acceptance

- `node scripts/check-no-agent-hardcoding.mjs` passes.
- `./scripts/run-all-tests.sh` passes.
- Playwright verifies MarkWisely launch, create/open/edit/save/recent, host isolation, failure feedback, and dirty-leave cancellation.
- Existing Markdown preview and other Desktop Dock applications continue to pass regression coverage.

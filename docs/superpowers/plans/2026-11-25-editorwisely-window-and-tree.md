# EditorWisely Window and Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open text files in a normal EditorWisely window with its file tree closed by default, while allowing the user to reveal a tree focused on the active file's directory.

**Architecture:** Remove automatic maximization from local/SSH Files and OS file-open routes while preserving the normal window maximize control. Add an EditorWisely header toggle for a hidden-by-default tree, and have the tree load and expand the active file's ancestor directories. Use Playwright E2E against the existing desktop flows and path-aware E2E fixtures.

**Tech Stack:** React, Zustand desktop store, Tauri invoke, Playwright, Vitest.

**Spec:** User request and screenshot in the current conversation.

## Global Constraints

- No new dependencies.
- Preserve the existing local/SSH file read and save paths.
- Keep the MarkWisely sidebar behavior and preferences independent from EditorWisely.
- Opening a Markdown file through the local OS route continues to open that document in MarkWisely.

## Review Focus

- Local Files and SSH Files text opens must not auto-maximize EditorWisely; test each route.
- Native OS text-file open must not auto-maximize; assert the window state in the existing E2E route.
- The tree must start hidden and be accessible through a header icon; test initial state and both toggle directions.
- Opening the tree for a nested active file must load/expand every ancestor and mark the file active; test a nested SSH path.
- Manual maximize/restore and MarkWisely's own sidebar preference must remain independent; cover maximize in existing desktop tests and preserve the Markdown route assertion.

## 要保住的旧行为

- 本机 Files 和 SSH Files 双击普通文本仍会在 EditorWisely 打开对应文件内容。
- 手动点击 EditorWisely 的最大化/还原控件仍只改变窗口尺寸状态。
- OS 打开本机 Markdown 文件仍在 MarkWisely 中打开对应文档。
- MarkWisely 侧栏仍默认关闭，且其显隐偏好不被 EditorWisely 的树开关改变。
- EditorWisely 树打开时仍支持点击文件切换文档和目录惰性加载。

## 架构

- `src/components/desktop/LocalDesktopFileManager.tsx`、`src/components/LocalFsPanel.tsx`、`src/App.tsx`：移除文本文件打开时的自动最大化动作；README 与 0.1.4 release notes 同步描述普通窗口行为。
- `src/e2eBootstrap.ts`：让模拟 OS 文件打开流程与生产窗口尺寸一致。
- `src/components/desktop/EditorWiselyWindow.tsx`、`EditorWiselyTree.tsx`：增加默认关闭的树开关，并按当前文档路径逐级加载目录。
- `src/e2e/tauriCoreMock.ts`、`src/e2eBootstrap.ts`、`e2e/tw-e2e.ts`：提供仅由树聚焦测试显式启用的隔离深层 SSH 目录夹具，避免改变 MarkWisely 的共享目录数据。
- `e2e/local-fs.spec.ts` 和 `e2e/home-local-terminal-chat.spec.ts`：覆盖本机/SSH/OS 打开、树开关与路径聚焦。
- `scripts/smoke-product-checklist.mjs`：验证 OS 打开的 EditorWisely 文件使用普通窗口。
- `src/i18n/locales/{zh-CN,en}/tools.json`：提供 EditorWisely 树按钮显隐文案。
- 不新增共享状态或耦合 MarkWisely 偏好；树开关属于 EditorWisely 窗口状态。

## 设计

- 双击本机或 SSH Files 中的普通文本，EditorWisely 以普通浮动窗口显示文件，不主动最大化；窗口最大化按钮仍可手动使用。
- EditorWisely 左侧文件树初始隐藏。标题栏的侧栏图标与 MarkWisely 一致，点击后打开，再点关闭；显隐状态只作用于当前 EditorWisely 实例。
- 打开文件树后，树从适用根目录逐级展开到当前文档的父目录，并高亮当前文件。目录加载状态和错误继续显示在树面板内。
- 本机系统打开 Markdown 的 MarkWisely 路由保持原样。

## 任务

### Task 1: Open text files in a normal EditorWisely window

**Files:** `src/components/desktop/LocalDesktopFileManager.tsx`, `src/components/LocalFsPanel.tsx`, `src/App.tsx`, `src/e2eBootstrap.ts`, `e2e/local-fs.spec.ts`, `e2e/home-local-terminal-chat.spec.ts`, `README.md`, `README.zh-CN.md`, `RELEASE_NOTES.md`, `release-notes/v0.1.4.md`

- [x] Update the local Files, SSH Files, and OS text-open E2E assertions to expect `data-maximized="false"`; run the focused tests and confirm current code fails.
- [x] Remove automatic maximization from those three production entry routes and the E2E OS-open adapter.
- [x] Run the focused routes; verify files still open and the existing MarkWisely Markdown OS-open test still passes.

### Task 2: Add a hidden-by-default EditorWisely tree toggle

**Files:** `src/components/desktop/EditorWiselyWindow.tsx`, `src/i18n/locales/zh-CN/tools.json`, `src/i18n/locales/en/tools.json`, `e2e/local-fs.spec.ts`

- [x] Update local and SSH Files E2E to assert the tree is initially hidden and the EditorWisely sidebar button opens/closes it; verify tests fail before implementation.
- [x] Add a `PanelLeft` header button with localized Show/Hide Files labels and conditionally mount the tree, defaulting closed.
- [x] Run the focused E2E and verify editor content remains visible while the tree is hidden or open. Manual maximize and restore remain available.

### Task 3: Focus the active document's parent in the tree

**Files:** `src/components/desktop/EditorWiselyTree.tsx`, `src/e2e/tauriCoreMock.ts`, `src/e2eBootstrap.ts`, `e2e/tw-e2e.ts`, `e2e/local-fs.spec.ts`, `scripts/smoke-product-checklist.mjs`

- [x] Add a nested SSH path test; after opening the tree, assert each ancestor is expanded and the active file row is visible/highlighted. Run and confirm it fails because the current tree stops at its root.
- [x] Extend the E2E remote directory fixture with the nested path and sequentially list/expand ancestors of `activePath`, canceling stale expansions when the active path changes or the tree unmounts.
- [x] Run the full `./scripts/run-all-tests.sh` plus `node scripts/check-no-agent-hardcoding.mjs`.

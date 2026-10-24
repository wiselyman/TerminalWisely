# 文件管理器图标视图只显示名称实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 文件管理器切换到图标视图时，每个文件项只显示文件名。

**Architecture:** 仅修改 `LocalFsContentsView` 的网格项渲染与对应 E2E；列表视图继续展示 Linux 权限、所有者、组、大小和修改时间。无需新增样式或状态。

**Tech Stack:** React, Playwright.

**Spec:** 用户本轮截图及要求。

## 要保住的旧行为

- 文件管理器列表视图仍显示权限、所有者、组、大小和修改时间列。
- 图标视图仍显示文件夹/文件图标、名称，并保留选择、拖放、双击打开和右键菜单行为。

## 架构

- `src/components/LocalFsContentsView.tsx`：图标网格只渲染图标与名称；列表表格及元数据逻辑保持原样。
- `e2e/local-fs.spec.ts`：回归断言列表元数据存在，切换图标视图后卡片只含名称且不渲染元数据节点。

## 设计

- 用户在文件管理器工具栏点击“图标视图”后，内容区每个项目只显示图标和文件名。
- 列表视图继续展示现有详细列；加载、成功和失败文案不变。

## Tasks

### Task 1：图标视图隐藏文件元数据

**Files:**
- Modify: `src/components/LocalFsContentsView.tsx`
- Test: `e2e/local-fs.spec.ts`

- [x] 更新 E2E：列表列和项目仍显示权限/所有者/组/修改时间；切换图标视图后项目只显示图标与文件名且没有 `.local-fs-grid-meta`。
- [x] 运行 `./scripts/e2e-playwright.sh e2e/local-fs.spec.ts --grep "Linux file metadata"` 并确认因图标卡片包含额外元数据而失败。
- [x] 从网格项目渲染中移除元数据行，不改变列表视图。
- [x] 运行 `./scripts/e2e-playwright.sh e2e/local-fs.spec.ts` 并确认通过。
- [x] 运行 `node scripts/check-no-agent-hardcoding.mjs` 和 `./scripts/run-all-tests.sh`。
- [x] 提交本任务。

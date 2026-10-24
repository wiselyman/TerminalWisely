# 移除文件管理器定位按钮实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从文件管理器工具栏移除截图标出的终端目录定位按钮及其专属跳转逻辑。

**Architecture:** 修改 `LocalFsPanel`，删除定位按钮、图标引用和只服务于该按钮的终端 cwd 跳转函数/导入。查找面板的“跟随终端当前目录”行为继续由 find store 独立提供。通过 `e2e/local-fs.spec.ts` 验证定位按钮消失且工具栏其余操作可用。

**Tech Stack:** React, Playwright.

**Spec:** 用户本轮截图及要求。

## 要保住的旧行为

- 后退、上级目录、Home、根目录、刷新、显示隐藏文件、设置和列表/图标视图切换继续可用。
- 查找面板的“跟随终端当前目录”仍保留。

## 架构

- `src/components/LocalFsPanel.tsx`：移除定位按钮及仅供该按钮使用的跳转代码。
- `e2e/local-fs.spec.ts`：验证定位入口缺席且相邻工具栏操作存在。
- `e2e/ui-visual-baselines.spec.ts` 与暗/亮截图：更新文件管理器工具栏基线。

## 设计

- 打开 Desktop 文件管理器后，工具栏不再显示定位按钮。
- 现有导航、刷新、设置与视图切换操作保持原位且可见；加载和错误反馈不变。

## Tasks

### Task 1：移除定位入口

**Files:**
- Modify: `src/components/LocalFsPanel.tsx`
- Test: `e2e/local-fs.spec.ts`

- [x] 在文件管理器工具栏回归用例断言没有“当前目录”定位按钮，同时刷新、隐藏文件和视图切换按钮仍存在。
- [x] 运行 `./scripts/e2e-playwright.sh e2e/local-fs.spec.ts --grep "path-bar search"`，确认因定位按钮仍存在而失败。
- [x] 删除定位按钮及其专属函数、图标和终端 cwd 导入。
- [x] 运行 `./scripts/e2e-playwright.sh e2e/local-fs.spec.ts` 并确认通过。
- [x] 运行 `node scripts/check-no-agent-hardcoding.mjs` 和 `./scripts/run-all-tests.sh`。
- [ ] 提交并推送本任务。

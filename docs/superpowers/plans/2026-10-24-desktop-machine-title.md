# Desktop 顶栏显示机器名实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desktop 顶栏左侧显示当前 SSH 主机的机器名，并移除顶栏右侧的面板收起按钮。

**Architecture:** 从已有 HostStatsSnapshot 读取 hostname，在 DesktopPanel 中按当前 sessionId 选择对应快照；标题快照未就绪时显示现有 Desktop 名称。只移除 DesktopPanel 对通用收起动作的挂载，不改变 AI、文件、查找等其他面板的收起行为。

**Tech Stack:** React, Zustand, Playwright.

**Spec:** 用户截图及本轮要求。

## Global Constraints

- 保留 Desktop Dock、应用窗口和会话切换行为。
- 其他工作台仍显示并使用现有收起面板控件。
- 不新增主机名探测接口；复用当前会话已有的 HostStatsSnapshot。

## Review Focus

- SSH 标签名与机器名不同：Desktop 标题显示机器名。
- 主机状态尚未加载或连接已断开：使用本地化 Desktop 标题兜底。
- 在 Desktop 顶栏删除收起按钮，不影响其他面板收起控件。

---

## 要保住的旧行为

- Desktop 图标、Dock 和桌面应用仍属于当前 SSH 会话，并在切换会话后跟随当前会话。
- AI 聊天、文件管理器、查找面板仍保留其面板收起按钮。
- Desktop 的机器名未加载时仍显示本地化的“桌面”标题。

## 架构

| File | Responsibility |
|------|----------------|
| `src/components/desktop/DesktopPanel.tsx` | 从 host stats store 读取当前会话 hostname，并渲染顶栏；移除通用收起按钮。 |
| `src/App.tsx` | 不再向 DesktopPanel 传入会话页签标题。 |
| `src/e2eBootstrap.ts` | 提供隔离的 E2E host machine name 设置器，不改变全局 Tauri fixture。 |
| `e2e/tw-e2e.ts` | 将机器名设置器暴露给 Playwright 测试。 |
| `e2e/host-desktop.spec.ts` | 验证机器名标题、收起按钮缺席以及其他工作台仍保留收起按钮。 |
| `e2e/ui-visual-baselines.spec.ts` | 为 Desktop 截图注入确定的机器名并更新其视觉基线。 |

## 设计

- 左上角显示当前远程机器名；主机名快照加载前显示现有“桌面”文案。
- 右上角保留时钟，不显示收起面板按钮。
- Desktop 以外的面板继续使用现有收起按钮和动画。

## Tasks

### Task 1: 用机器名标识 Desktop 并移除顶栏收起按钮

**Files:**
- Modify: `src/components/desktop/DesktopPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/e2eBootstrap.ts`
- Modify: `e2e/tw-e2e.ts`
- Test: `e2e/host-desktop.spec.ts`
- Test: `e2e/ui-visual-baselines.spec.ts` and its dark/light snapshots

- [x] **Step 1: 写失败的 Playwright 回归测试** — 使用隔离的 E2E 设置器注入与标签名不同的 hostname，断言 Desktop 顶栏显示 hostname、不显示标签别名或收起按钮；切到 AI 聊天面板确认其收起按钮仍存在。
- [x] **Step 2: 运行测试并确认失败** — `./scripts/e2e-playwright.sh e2e/host-desktop.spec.ts --grep "machine name"`。
- [x] **Step 3: 实现最小修改** — DesktopPanel 使用 `useHostStatsStore` 中匹配当前 sessionId 的 hostname；移除该顶栏的 WorkspacePanelHeadActions。
- [x] **Step 4: 运行相关 E2E** — `./scripts/e2e-playwright.sh e2e/host-desktop.spec.ts e2e/ui-visual-baselines.spec.ts`。
- [x] **Step 5: 提交** — `fix: show host machine name in desktop bar`。

## 完成验证

- [x] `node scripts/check-no-agent-hardcoding.mjs`
- [x] `./scripts/run-all-tests.sh`
- [x] 确认桌面标题测试及非 Desktop 面板收起测试通过。

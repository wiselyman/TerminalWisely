# Maximized Desktop App Titlebar Takeover Implementation Plan

**Goal:** When a Desktop app is maximized, let the app own the main titlebar while retaining native host-window controls and the app's own window actions.

**Architecture:** Derive a titlebar takeover state from the active Desktop target and maximized app state in `App.tsx`. CSS hides host navigation, tabs, and global tools only during takeover; the existing portal-mounted app title and minimize/restore/close controls fill the remaining titlebar. macOS native traffic lights remain visible in their reserved native area.

**Tech Stack:** React, TypeScript, CSS, Playwright.

**Spec:** `docs/superpowers/plans/2026-10-29-desktop-app-maximize.md` and the user's approved direction in this conversation.

## 要保住的旧行为

- 浮窗态仍显示空间导航、终端/主机页签、全局聊天/桌面入口、主题和语言按钮。
- 最大化态的恢复按钮仍只恢复内嵌 Desktop app，并回到原浮窗尺寸；不改变 TerminalWisely 主窗口大小。
- 最大化态的最小化与关闭仍只作用于内嵌 Desktop app；MarkWisely 关闭继续执行现有保存检查。
- macOS 原生交通灯仍操作宿主 TerminalWisely 窗口，并保留它们在标题栏左侧的安全间距。
- 退出最大化后，宿主标题栏全部导航、标签和全局工具恢复可见。
- Local 与 SSH Desktop 的目标状态及应用窗口状态仍相互隔离。

## 架构

- `src/App.tsx`：从 `desktopMode` 和当前目标的 `useDesktopStore` maximized app 状态派生 `desktop-app-chrome-mode`，只向 app-shell 增加状态类。
- `src/App.css`：定义 takeover 状态下各平台主标题栏的布局，隐藏侧栏切换、标签、新建页签、聊天/桌面、主题与语言控件；保留 macOS 原生交通灯占位、Portal app 标题和宿主平台窗口控件。
- `src/components/desktop/DesktopAppWindow.tsx`：继续复用同一组 Portal 控件及已有处理函数，不改窗口操作语义。
- `e2e/host-desktop.spec.ts`：验证最大化后标题栏接管、交通灯预留区仍存在、应用操作可用，以及恢复后宿主控件重新出现。

## 设计

- 最大化 Desktop app：标题栏左侧留出系统交通灯区域，标题栏其余空间显示应用图标/名称和内嵌窗口操作；隐藏空间切换、终端/主机页签、新建页签、聊天/桌面、主题和语言入口。
- 非 macOS 平台保留宿主窗口自身的系统级窗口控件；最大化 app 的最小化/恢复/关闭控件属于 app 自身。
- 恢复、最小化或关闭内嵌 app 后，主标题栏返回常规 TerminalWisely 控件布局。
- 此模式不改变 Desktop 菜单栏（最大化时已隐藏）、Dock、应用内容和外层窗口交通灯语义。

## 任务

1. 在 `e2e/host-desktop.spec.ts` 的 MarkWisely 最大化流程中增加断言：标题栏接管状态生效；页签、空间切换、聊天/桌面、主题/语言和新建入口隐藏；Portal 标题与 MarkWisely 窗口按钮可见；恢复后宿主控件重新显示。运行并确认测试因缺少 takeover 状态而失败。
2. 在 `src/App.tsx` 根据当前 Desktop 状态添加 app-shell takeover 类；在 `src/App.css` 隐藏外壳导航和全局工具、铺开 Portal 区并保留平台窗口控制。运行目标 Playwright 用例确认通过。
3. 运行 `node scripts/check-no-agent-hardcoding.mjs` 与 `./scripts/run-all-tests.sh`；检查 `git diff --check`，提交并推送到 `main`。

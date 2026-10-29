# Desktop 应用窗口最大化与恢复

## 要保住的旧行为

- 用户从 Dock 启动应用后，窗口仍以可拖动、可调整大小的浮窗打开。
- 点击最大化后，应用窗口填满所属 Desktop surface，不覆盖应用外壳；Dock 仍按当前边缘呼出逻辑工作。
- 点击恢复按钮后，应用回到最大化前保存的浮窗位置和尺寸。
- 最小化会将窗口从 Desktop surface 隐藏到 Dock；关闭会关闭窗口。
- Local 与每个 SSH Desktop 的窗口状态继续独立保存。

## 架构

- `src/stores/desktopStore.ts`：调整最小化/恢复状态转换；保留 `frames[app]`，最小化时清除 `maximized`，从 Dock 恢复时自然回到原浮窗。
- `src/components/desktop/DesktopAppWindow.tsx`：为最大化状态提供可见应用名称和可访问名称，保持同一窗口组件与既有按钮路径。
- `src/styles/desktop.css`：仅调整最大化标题栏，使其呈现完整应用窗口的标题层级；普通浮窗保持紧凑样式。
- `src/stores/desktopStore.test.ts` 与 `e2e/host-desktop.spec.ts`：覆盖状态转换与 Dock 恢复后的窗口形态。

## 设计

- 点击最大化：应用铺满 Desktop surface，标题栏显示应用图标、应用名称以及最小化、恢复、关闭控件，视觉上成为完整应用工作区。
- 点击恢复：回到原位置和尺寸的 Desktop 浮窗。
- 点击最小化：窗口进入 Dock；再次点击 Dock 图标时以原位置和尺寸恢复为普通浮窗。
- 加载、成功和失败提示继续由各应用现有内容区域负责；本改动不更改应用业务提示。

## 任务

1. 先增加 Store 和 Playwright 回归断言：最大化最小化后从 Dock 恢复为非最大化浮窗，并保留最大化前 frame；断言最大化窗口显示应用名称。运行对应测试并确认失败。
2. 实现最小化清理最大化状态、最大化标题栏名称显示和样式。
3. 运行对应单测与 Playwright 用例，再运行硬编码禁检和全量测试；固定 Desktop 时钟截图测试遮罩尺寸，避免日期变化造成基线误报。

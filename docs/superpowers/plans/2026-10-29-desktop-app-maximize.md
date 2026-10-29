# Desktop 应用原生标题栏层级

## 要保住的旧行为

- 用户从 Dock 启动应用后，窗口仍以可拖动、可调整大小的浮窗打开。
- 最大化应用填满 Desktop surface，外层应用、SSH 会话和 Desktop 菜单栏仍在原位。
- 最大化前的浮窗 frame 保留；恢复或最小化后从 Dock 打开，回到原来的浮窗位置和大小。
- 最小化会将窗口隐藏到 Dock；关闭会关闭对应应用。
- MarkWisely 关闭前仍调用现有保存/关闭检查；Local 与各 SSH Desktop 状态继续隔离。
- Dock 在最大化时仍按当前底边呼出逻辑工作。

## 架构

- `src/lib/desktopChromeHost.ts`：提供主标题栏按钮区的 portal host，供最大化应用把原有控件移入外层窗口 chrome。
- `src/App.tsx`：在最上层标题栏提供空的应用标题/控件挂载槽。
- `src/components/desktop/DesktopAppWindow.tsx`：最大化时将名称和原有最小化、恢复、关闭控件 portal 到主标题栏；Desktop surface 内隐藏应用自己的窗口标题栏，让内容从 menubar 下方铺满。保留同一 close handler。
- `src/styles/desktop.css` 与 `src/App.css`：定义主标题栏中的应用控件外观及最大化内容区域布局；浮窗态仍使用 app-in-app 标题栏。
- `src/stores/desktopStore.ts`：最小化清除最大化标记，保留 frame；从 Dock 恢复为浮窗。
- `src/stores/desktopStore.test.ts`、`e2e/host-desktop.spec.ts`：覆盖状态与真实控件层级。

## 设计

- 浮窗态：名称与最小化、最大化、关闭控件显示在应用自己的小标题栏中。
- 最大化态：应用名称与同一组控件移动到 TerminalWisely 的主标题栏，和 SSH/终端页签处于同一层级；Desktop surface 内不再保留第二层应用标题栏，应用内容填满 Desktop 工作区。
- 点击主标题栏的恢复按钮：控件返回应用浮窗标题栏，窗口恢复原 frame。
- 点击主标题栏的最小化按钮：应用进入 Dock；从 Dock 打开时回到浮窗态。
- 点击主标题栏的关闭按钮：执行应用原有关闭路径，包括 MarkWisely 的保存检查。
- 标题栏挂载槽无可见空内容；此改动不更改应用正文、菜单栏、Dock 或外层系统窗口控件。

## 任务

1. 先增加 Store 和 Playwright 失败用例：最大化后 app chrome 位于主标题栏且内层标题栏隐藏；恢复/最小化/Dock 恢复执行正确；最大化前 frame 保留；关闭仍通过原有 handler。运行对应测试并确认失败。
2. 接入主标题栏 portal host，移动最大化控件，并调整标题栏与内容区样式。
3. 运行对应单测、Playwright 与硬编码禁检；固定 Desktop 时钟截图用例的遮罩尺寸，避免日期变化造成基线误报；再运行全量测试。

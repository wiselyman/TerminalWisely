# MarkWisely 系统文件打开默认铺满实施计划

## 要保住的旧行为

- 系统向 TerminalWisely 传入 Markdown 路径后，文件仍在本机 MarkWisely 打开，失败仍显示错误。
- 用户从 Dock 手动启动 MarkWisely 时，保持原有窗口行为；用户仍可还原最大化窗口。

## 架构

- 系统文件事件在 `src/App.tsx` 消费。打开文件后调用 `desktopStore` 已有的 `setAppMaximized`，不新增窗口状态机制。
- 用现有 Playwright 的系统文件打开模拟路径验证显示状态。

## 设计

- 用户从系统用 TerminalWisely 打开 `.md`，MarkWisely 自动铺满应用桌面区域，文件内容立即可见。
- 打开失败沿用现有 toast。窗口标题栏的还原按钮可回到浮窗。

## 任务

- [x] 为系统 Markdown 打开入口增加铺满窗口的静态回归断言；临时移除最大化调用后 smoke 失败。
- [x] 在文件打开入口复用最大化动作，运行定向测试。
- [x] 运行硬编码禁检及全量测试。

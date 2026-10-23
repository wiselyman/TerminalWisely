# Home 本机终端页签计划

## 要保住的旧行为

- Home 仍默认展示本机交互式终端和本机聊天，左侧空间导航仍隐藏。
- Home 终端与聊天分隔条继续可拖动、键盘调整，并按现有规则持久化。
- Home 的 `+` 新建一个独立的本机 Terminal 页签；切换页签时各自的 PTY 保持运行，关闭页签时只结束对应 PTY。
- Hosts、Kubernetes、Databases 空间中的 `+` 仍分别执行新增 SSH、集群和数据库连接流程。
- Home 仍不显示独立 Home 空间页签；聊天 scope 与主机/K8s/DB 状态隔离保持不变。

## 架构

- `src/App.tsx`：在 Home 状态下显示本机终端页签，管理页签增删与当前选择；Home 的新增按钮走本机终端新增回调，其他空间沿用既有新增分发。
- `src/components/home/HomeWorkspace.tsx`：接收终端页签和活动项，保持聊天面板单例，并为各终端保留独立的 `LocalTerminal` 实例。
- `src/components/home/LocalTerminal.tsx`：接收稳定终端标识用于 DOM 可测性；PTY 生命周期仍由组件挂载/卸载管理。
- `src/App.homeTab.test.ts` 与 `e2e/home-local-terminal-chat.spec.ts`：验证 Home 页签交互及空间新增行为；复用现有桌面壳、tab 与 `chrome-new-session` 控件。

## 设计

- Home 页面上方标题栏显示 `Terminal 1` 等本机终端页签和现有 `+` 图标。点击页签切换终端；页签上的关闭按钮结束该本机 PTY。最后一个页签关闭时自动保留一个可用终端。
- 点击 Home 的 `+` 后立即创建并选中新终端，启动状态直接显示在终端区域；启动失败沿用终端内错误文案。没有额外弹窗。
- Home 页签采用现有 `.tab` / `.tab-close` 桌面壳样式；其他空间沿用当前标题栏新增连接入口。

## 任务

1. [x] 测试：添加 Home 标题栏终端页签与 Home `+` 路由的回归断言，并更新 Playwright 覆盖新增、切换、关闭终端及 SSH 新建计数不变；先运行并确认失败。
2. [x] 实现：在 App 管理 Home 终端页签，将新增按钮按 Home 状态分发；HomeWorkspace 保持多份独立 LocalTerminal，添加页签选择与关闭交互。
3. [x] 验证：运行相关 Vitest 和 Playwright、硬编码禁检及 `./scripts/run-all-tests.sh`，确认 Hosts/K8s/DB 的 `+` 原行为仍通过。

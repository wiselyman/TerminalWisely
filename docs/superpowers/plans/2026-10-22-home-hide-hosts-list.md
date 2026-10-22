# Home 下隐藏 Hosts 列表

## 要保住的旧行为

- Home 空间显示本机终端和聊天，左侧保留导航但不显示 Hosts 分组或主机条目。
- 切换到 Hosts 空间后，已有 Hosts 分组、主机列表和新增主机入口照常显示。
- Home 与 Hosts 之间切换不建立或断开 SSH 会话，顶部 Home 标签和 Home 侧栏按钮仍进入同一空间。
- K8s 与数据库侧栏的现有列表和工作区行为不变。

## 架构

- `src/App.tsx`：将 `homeOpen` 传给左栏 `ConnectionPanel`。
- `src/components/ConnectionPanel.tsx`：根据 Home 状态隐藏仅 Hosts 用的目录主体；K8s/DB 分支不变。
- `e2e/app-shell.spec.ts`：通过 Playwright 验证 Home 隐藏 Hosts 组、切换 Hosts 可见。
- 不新增状态或样式；沿用现有 sidebar 壳和 `homeOpen` store。

## 设计

- Home 下左侧只显示顶部空间入口，不显示 Hosts 分组与主机卡片。
- 点击 Hosts 后在相同侧栏区域显示原有主机分组与条目；切回 Home 后列表消失。
- 空白侧栏不额外显示占位文案、按钮或错误提示。

## 任务

1. [x] 增加 E2E 回归：Home 隐藏 Hosts 目录、切换 Hosts 后恢复。
2. [x] 运行测试确认当前实现不能满足要求，再将 `homeOpen` 传入 ConnectionPanel 并在 Hosts 分支应用该状态；Hosts 导航同时离开 Home。
3. [x] 运行目标 E2E、硬编码禁检和全量测试。

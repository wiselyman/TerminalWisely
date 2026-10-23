# Home 隐藏底部主机状态栏计划

## 要保住的旧行为

- Home 左侧 Terminal 延伸到窗口底部，不显示主机状态栏占位或灰色底边。
- Hosts 空间继续显示当前会话的主机状态栏；Kubernetes 空间继续显示集群状态栏。
- Home 与聊天之间的可调分隔条、Home 页签和聊天功能不变。

## 架构

- `src/App.tsx`：Home 状态不挂载底部状态栏；非 Home 空间保留现有 Host/K8s 状态栏分派。
- `src/App.css`：状态栏存在时才为应用壳设置状态栏高度类，避免 Home 下遗留底部预留空间。
- `e2e/app-shell.spec.ts`：覆盖 Home 底部无状态栏、切换 Hosts 后恢复状态栏。

## 设计

- Home 将主机状态条完整移除，Terminal 面板填满内容区高度。
- Hosts/Kubernetes 保留各自原状态条及文案，不新增占位或分隔线。
- 复用现有 App 壳和状态条组件，只按空间条件控制其挂载。

## 任务

1. [x] 测试：在 Home/Hosts 的 Playwright 路径断言状态栏隐藏/显示，先运行并确认 Home 断言失败。
2. [x] 实现：Home 不渲染状态栏组件，并在 Home 下清除状态栏高度类。
3. [x] 验证：运行相关 Home Playwright、硬编码禁检及全量测试。

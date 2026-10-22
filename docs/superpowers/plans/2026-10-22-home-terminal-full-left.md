# Home 终端占满左侧工作区

## 要保住的旧行为

- Home 下左侧空间目录和主机列表都不显示；终端工作区从窗口内容区最左侧开始，右侧本机聊天保持不变。
- Home 标题栏标签和空间入口仍可见并可用；Home 隐藏侧栏主体，Hosts/Kubernetes/Databases 导航可直接离开 Home。
- 点击 Hosts 后主机侧栏与目录正常出现；顶部 Home 标签可返回无侧栏的 Home 空间。
- 主机 SSH、K8s、DB 工作区及终端会话状态不因 Home 布局改变而丢失。

## 架构

- `src/App.tsx`：Home 时保留挂载 `ConnectionPanel` 的 portal host，但通过 Home 根类隐藏其可视侧栏；保留标题栏空间入口和 Home 标签。
- `src/App.css`：Home 时 `.app-body` 使用单列并隐藏 `.sidebar-shell`，使 `workspace-frame` 和终端从内容区左边开始。
- `e2e/app-shell.spec.ts`：验证 Home 不存在侧栏且本机终端位于 x=0；切换 Hosts 后侧栏恢复。
- 不创建新的导航或布局状态，沿用现有 `homeOpen`。

## 设计

- Home 下隐藏整个侧栏目录区域；终端占据主工作区左栏的完整宽度，聊天占右栏。
- 标题栏保留空间入口和 Home 标签；Home 下内容区从最左侧开始，导航只占标题栏高度。
- 点击 Hosts 后恢复现有侧栏与目录；顶部 Home 标签返回 Home 后再次隐藏侧栏。
- 不新增空状态或占位内容，沿用现有双栏终端/聊天布局和窗口壳。

## 任务

1. [x] 添加 Playwright 回归，Home 下 `.sidebar-shell` 不可见，终端左边界贴齐内容区；Hosts 切换后侧栏回来。
2. [x] 保留 ConnectionPanel 的 portal host，以 CSS 隐藏 Home 侧栏并设置单列布局；Hosts/K8s/DB 导航离开 Home。
3. [x] 运行 Home/DB 目标 E2E、硬编码禁检和全量测试。

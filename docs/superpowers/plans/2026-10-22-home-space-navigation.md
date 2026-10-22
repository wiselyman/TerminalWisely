# Home 独立空间入口计划

## 要保住的旧行为

- 启动应用后 Home 空间默认打开，显示本机终端与本机聊天。
- 点击 Home 入口不会创建或切换 SSH 连接；原 Hosts/Kubernetes/Databases 入口仍能切换各自侧栏。
- 从数据库视图点击 Home 后数据库侧栏状态不被强制改成 Hosts；顶部 Home 标签仍可返回 Home。
- 选择一个 Hosts 或 Kubernetes 实体后仍离开 Home 并打开对应工作区。

## 架构

- `src/App.tsx`：在侧栏视图按钮组的 Hosts 之前增加 Home 入口，沿用 `homeOpen` 状态和 `activateHome()`；保留标题栏 Home 标签为第二个入口。
- `src/stores/managedEntityStore.ts`：确保冷启动默认 Home 打开，不新增独立重复状态。
- `src/i18n/locales/{zh-CN,en}/shell.json`：为侧栏 Home 入口提供本地化名称。
- `e2e/app-shell.spec.ts` 与 `src/App.homeTab.test.ts`：验证按钮顺序、默认激活、Home/Hosts 切换以及旧视图可用。
- 复用现有 `.chrome-sidebar-views` / `.chrome-sidebar-view-btn` 导航壳和 Home 图标，不新增视觉系统。

## 设计

- 用户启动应用后默认进入 Home 空间；左侧导航第一项是 Home，之后依次是 Hosts、Kubernetes、Databases。
- 点击侧栏 Home 按钮切回本机终端与聊天；按钮在 Home 打开时显示选中态。顶部 Home 标签继续可用并显示同一内容。
- 点击 Hosts/Kubernetes/Databases 后保留现有加载与工作区行为；异常状态由现有视图承接，不新增独立反馈。
- Home 按钮复用侧栏现有图标按钮尺寸、选中态、tooltip 和 aria 标签。

## 任务

1. 为侧栏首位 Home 入口、默认选中态和切换行为添加 Vitest/Playwright 回归用例，先运行并确认失败。
2. 接入 Home 侧栏按钮及选中态，沿用 `homeOpen` 和现有 `activateHome()`；补全中英文标签。
3. 跑对应前端与 E2E 测试、硬编码禁检及全量测试脚本。

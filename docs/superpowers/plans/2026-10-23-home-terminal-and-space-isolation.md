# Home Terminal 与空间隔离缺陷修复

## 要保住的旧行为

- 打开 Home 时，Home Terminal 标签和本机聊天可见；Hosts、Kubernetes、数据库的标签不能出现在 Home 顶栏。
- 点击 Hosts、Kubernetes、数据库空间时，只显示该空间的标签与主体；返回 Home 后只显示 Home 的本机 Terminal 标签，其他空间的会话仍保留在各自空间，切回后可继续访问。
- Home Terminal 的提示符及后续输出与终端容器左边缘保持清楚、稳定的内边距，窗口缩放后终端仍能正确 fit。
- Kubernetes 没有集群时，页面不再显示“请从侧栏选择集群，或点 + 添加。”提示；侧栏和标题栏的添加入口仍可用。
- Home 是独立空间；其激活状态不能同时把 Hosts、Kubernetes 或数据库空间按钮标记为选中。

## 架构

- `src/App.tsx`：空间按钮选中态和各空间顶栏标签的显示条件；Home 进入/退出仍走既有 store，保持各空间现有标签存储。
- `src/styles/home.css`：给 Home xterm 挂载容器设置内边距；ResizeObserver 继续观察内容容器，以维持 FitAddon 尺寸同步。
- `src/components/k8s/K8sWorkbench.tsx` 与 `src/i18n/locales/{zh-CN,en}/k8s.json`：删除无集群时的冗余提示渲染及仅该提示使用的本地化键，不改集群添加操作。
- `e2e/app-shell.spec.ts`、`e2e/home-local-terminal-chat.spec.ts` 与新增/更新 Vitest 契约：先覆盖空间切换隔离、Home 选中态、Home Terminal 内边距、K8s 空状态；样式留在 Home 子系统，业务状态不进入 CSS。

## 设计

- 用户在顶栏点击 Home/Hosts/Kubernetes/数据库按钮切换空间。加载后，顶栏只显示该空间的标签；切回空间恢复该空间原有会话。
- Home Terminal 的输出从内容区内缩约 12px，顶部和左侧均保留留白，避免首行文字贴着窗口边缘；该容器仍铺满 Terminal pane。
- Kubernetes 空集群时保留空工作区，不显示正文提示；添加集群按钮继续在侧栏和标题栏可发现。
- 不新增加载/成功提示；终端启动失败沿用现有终端错误输出，空间内容按现有数据来源渲染。

## 任务

- [x] 先补 Playwright 回归：断言 Home 中不显示 Hosts/K8s/DB 标签、四个空间切换时各自标签隔离且状态可恢复、Home Terminal padding 非零、K8s 空集群没有提示文本但添加入口仍在。运行对应测试并确认新断言失败。
- [x] 最小改动实现空间导航选中态和标签渲染隔离、Home Terminal 内容内边距、移除 K8s 冗余空态文案；运行定向 Vitest/E2E。
- [x] 更新 `docs/TEST_MATRIX.md` 和本计划验收结果；运行 `node scripts/check-no-agent-hardcoding.mjs` 与 `./scripts/run-all-tests.sh`，通过后提交并推送 `main`。

## 验收记录

- 定向回归：Vitest 13 passed；Home/空间隔离/K8s 空状态/Home Terminal 和 DB 返回工作流 Playwright 均通过。
- 全量 `./scripts/run-all-tests.sh`：通过；Sidecar 502 passed / 3 skipped，Playwright 95 passed，Rust 及其他流水线检查通过。`node scripts/check-no-agent-hardcoding.mjs` 与 `git diff --check` 通过。

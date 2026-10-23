# Home 入口与可调分栏计划

## 要保住的旧行为

- Home 仍是默认空间，标题栏空间按钮能进入 Home；进入其他空间时对应目录和工作区正常显示。
- 标题栏不出现额外 Home 页签；无论当前是 Home 还是其他空间都没有 `data-tab-role="home"`。
- Home 左侧仍是本机 PTY 终端，右侧仍是本机聊天；聊天历史、终端生命周期和响应式 resize 保持现状。
- 拖动 Home 终端与聊天之间的分隔条会调整两栏宽度；宽度限制在可用区域的 20%–80%，并持久化，重启/重载后恢复。
- Hosts/K8s/DB 的现有终端页签、连接管理及 DB portal 保持不变。

## 架构

- `src/App.tsx`：删除标题栏 Home tab，只保留侧栏顶部 Home 空间按钮；所有从 Home 返回的入口走该按钮。
- `src/components/home/HomeWorkspace.tsx`：新增可访问的拖动分隔条，管理并持久化终端宽度比例。
- `src/components/home/homeSplit.ts`：封装默认比例、读写存储和比例边界的纯逻辑。
- `src/App.css`：Home 网格按动态比例显示终端、分隔条、聊天；交互态复用现有 col-resize 约定。
- `src/App.homeTab.test.ts`、`src/components/home/homeSplit.test.ts`、`e2e/home-local-terminal-chat.spec.ts`、`e2e/db-workbench.spec.ts`：覆盖 Home 页签移除、键盘/鼠标调整、持久化与空间切换。

## 设计

- Home 按钮是唯一的 Home 导航入口；Home 与非 Home 状态都不显示单独 Home 页签。
- Home 仍采用左右两栏。终端与聊天中间加入窄分隔条，鼠标可拖动；键盘左右方向键以小步调整，Home/End 将终端宽度设为允许的最小/最大值。
- 分隔条设有明确的可访问名称、`role="separator"`、`aria-valuenow/min/max`；拖动宽度即时变化并保存，拖动到边界时停止扩展。
- 分栏复用现有 Home 双栏和 `body.workspace-resizing` 样式，不增加额外面板或状态提示。

## 任务

1. [x] 测试：移除 Home tab 的静态断言改为断言 Home tab 不存在；添加 Home split ratio 纯逻辑测试；更新 E2E 覆盖 resizer 拖动/键盘/持久化、切换空间后入口行为。先运行并确认失败。
2. [x] 实现：删除 Home tab 和相关 E2E 点击，HomeWorkspace 加入可访问的可拖动分隔条与比例持久化，更新样式。
3. [x] 验证：跑目标 Vitest/Playwright、硬编码禁检和 `./scripts/run-all-tests.sh`；检查 Hosts/K8s/DB 相关路径。

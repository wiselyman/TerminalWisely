# 0.1.3 Home Host Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a Home landing page that lists Local first and saved SSH hosts by their existing groups, and open each selected host's Desktop view in a new application tab.

**Architecture:** Keep saved-host ordering, grouping, and connection flows in the existing entity layout and session stores. A saved-host click creates the existing SSH session tab and opens its target-aware Desktop workspace there; Local gets its own lightweight Desktop tab because it has no SSH session. Home becomes the directory entry while existing local terminal/chat access remains available from Home.

**Tech Stack:** React, TypeScript, Zustand, existing Tauri SSH/Desktop commands, i18next, Vitest, Playwright.

**Spec:** User request in the 2026-11-18 conversation and `docs/HANDOFF.md`.

## Global Constraints

- Develop and push only on `main`; do not create a feature branch or PR.
- Do not add task or software special cases, hard-coded host data, or software allowlists.
- `node scripts/check-no-agent-hardcoding.mjs` and `./scripts/run-all-tests.sh` must pass before the feature is complete.
- Existing Home local Terminal/chat and SSH host session behavior must remain available.

## 要保住的旧行为

- 启动应用仍进入 Home；本机 Terminal 标签切换后仍保留各自 PTY，Home 本机聊天仍只属于本机 scope。
- 从 Hosts 列表连接已保存主机仍使用原密码提示、认证、错误提示及 SSH 会话创建流程；已有 SSH Terminal 标签继续可切换和关闭。
- Hosts 的分组、拖动排序、重命名、折叠状态、删除自定义分组和「未分组」归属仍由现有 entity layout 持久化；Local 不进入 SSH host 分组或持久化列表。
- 在 SSH Desktop 标签切换主机时，Desktop/files/browser/chat 上下文仍隔离到对应 SSH session；Local Desktop 不创建 SSH 会话，也不调用 SSH 命令。
- 窗口标题栏继续使用现有标签栏与新建 SSH / Local Terminal 操作；Home 页面不出现侧栏收起控件，标题栏不出现 AI 或 Desktop 快捷按钮。

## 架构

| 职责 | 文件 |
|---|---|
| Home 主机目录及 Local 首项 | 新建 `src/components/home/HomeHostDirectory.tsx`；`src/App.tsx` 选择目录或保留的 Home Terminal/chat 内容 |
| Local Desktop 标签打开/激活/关闭 | `src/stores/managedEntityStore.ts` 保存独立的 Local Desktop 标签状态；不把 Local Desktop 伪装成后端 SSH Session |
| Home 分组目录复用 | `src/App.tsx` 通过 `selectEntitySections` 读取 `src/stores/entityLayoutStore.ts` 的分组和顺序，再传给目录卡片；侧栏 `EntityListView` 不变 |
| SSH 卡片连接并打开 Desktop | `src/components/ConnectionPanel.tsx` 暴露复用 saved connection 认证入口；成功后用返回的 session id 激活 SSH 标签并打开对应 Desktop target |
| Workspace 标签内容选择与切换 | `src/App.tsx` 路由 Home Local Desktop 与 SSH Desktop；`src/stores/desktopStore.ts` 和 `src/stores/hostWorkspaceMemory.ts` 继续提供 target-aware workspace snapshot |
| Home 与 Desktop 标签交互样式 | `src/styles/home.css`, `src/App.css`, `src/i18n/locales/{zh-CN,en}/shell.json` |
| 回归路径及能力矩阵 | `e2e/home-host-directory.spec.ts`, `src/stores/sessionStore.test.ts`, `src/stores/hostWorkspaceMemory.test.ts`, `docs/TEST_MATRIX.md`, `README.md`, `RELEASE_NOTES.md`, `CHANGELOG.md` |

依赖方向：Home directory → saved connection/session APIs；SSH session tab → active session identity → existing target-aware Desktop stores. Local Desktop tab state is separate from SSH sessions and only opens `{ kind: "local" }`. 不得让页面组件直接拼接 SSH command 或绕过 session store。关闭 Local Desktop tab 不影响 SSH session 生命周期；关闭 SSH Terminal tab 的规则不变。

## 设计

- 点击标题栏 Home 标签后，主内容显示 Home 主机目录。目录第一项为 Local，下面按当前 Hosts 的分组和顺序显示所有已保存 SSH 主机；分组计数反映组内主机数。页面使用与应用一致的浅/深色主题与卡片布局，参考附件的信息层级但不复制其品牌、左侧导航或布局细节。
- Local 卡片始终在所有 SSH 分组之前。点击 Local 后，标签栏新建并激活一个 Local Desktop 标签，主内容呈现本机 Desktop；重复点击仍新建独立标签。Local 操作不触发 SSH 连接。
- 点击 SSH 主机卡片后，复用现有凭据提示和 `connectSaved` 流程；连接成功时新建并激活 SSH session 标签，并立即将该 session 的工作区切换为 Desktop。凭据缺失时先显示既有密码对话框；取消不新建标签。连接失败沿用现有 toast/状态提示，不留下无效标签。
- Local Desktop 标签显示 Local；SSH 标签仍显示主机名。点击标签在 Home Terminal、Local Desktop、SSH session 间切换。关闭 Local Desktop 标签只关闭该 Desktop workspace，关闭 SSH Terminal/session 标签继续遵守当前清理规则。Home 标签切回目录。
- Home 页面保留进入本机 Terminal 与本机聊天的现有入口，行为和本机 scope 不变。Home 目录界面不显示侧栏收起按钮；不添加右上角 AI/Desktop 快捷按钮。既有侧栏 Hosts 分组管理仍可用。
- 加载 saved connections 时目录显示现有加载状态；无 SSH 主机时仍显示 Local 和适当的空状态；连接失败由现有错误反馈承接，不显示虚构的在线状态或本机测量数据。

## Review Focus

- 同一 SSH 主机连续打开多个 session 时每个标签仍绑定各自 session，不串用当前活动 host；Store/E2E 测试断言 target/session 映射。
- 密码提示取消、连接失败或重复点击连接中的主机时不产生重复/失效 Desktop 标签；Store 与 Playwright 覆盖。
- 空 saved-host 列表、主机增删以及布局迁移后 Local 仍固定置顶，组顺序和 host 顺序仍按现有持久化数据；组件测试覆盖。
- 快速切换 Local、SSH Terminal 与不同主机 Desktop 时，延迟的工作区恢复不会把应用窗口/文件/浏览器发到错误 target；host workspace Store 测试覆盖。
- 关闭活动 Desktop tab、关闭其 SSH Terminal tab、关闭非活动 Desktop tab 时 active tab 与 session 清理状态一致；Playwright 覆盖。

---

### Task 1: Home 主机目录和 Local 首项

**Files:**
- Create: `src/components/home/HomeHostDirectory.tsx`
- Modify: `src/App.tsx`, `src/components/management/EntityListView.tsx`, `src/styles/home.css`, `src/i18n/locales/zh-CN/shell.json`, `src/i18n/locales/en/shell.json`
- Test: `src/components/home/HomeHostDirectory.test.ts`, `e2e/home-host-directory.spec.ts`

**Interfaces:**
- Consumes: `savedConnections`, `loadSavedConnections`, `selectEntitySections` / current hosts layout.
- Produces: `HomeHostDirectory` props `{ onOpenLocal: () => void; onOpenHost: (saved: SavedConnection) => void }`；Local 单独置顶，SSH 主机按当前 group/order 展示。

- [x] **Step 1: 写失败测试**：验证 Home 进入目录、Local 固定首项、每个现有分组及组内主机顺序匹配 Hosts layout；无 SSH 主机时 Local 仍显示；目录无侧栏收起、AI/Desktop 快捷按钮；Local Terminal/chat 入口仍可用。
- [x] **Step 2: 运行 RED**：目录组件与入口缺失时确认 Vitest/E2E 按预期失败。
- [x] **Step 3: 最小实现**：新增 Home directory 并复用 entity sections 的数据模型；Home 标签激活目录，增加 Local 和本机 Terminal/chat 入口。不要改变 SSH group layout 持久化。
- [x] **Step 4: 验证 GREEN**：重跑该 Vitest 与 Playwright 用例；确认 Local 首项、目录入口、无主机空状态与主机分组目录路径。

### Task 2: 独立 Desktop workspace tabs

**Files:**
- Modify: `src/stores/managedEntityStore.ts`, `src/stores/sessionStore.ts`, `src/App.tsx`, `src/components/ConnectionPanel.tsx`
- Test: `src/stores/managedEntityStore.test.ts`, `e2e/home-host-directory.spec.ts`

**Interfaces:**
- Produces: Local Desktop tab state `{ id: string; title: string }[]`, `openHomeDesktopTab(): string`, `activateHomeDesktopTab(id: string): void`, `closeHomeDesktopTab(id: string): void`。
- SSH 主机卡片使用既有 `connectSaved`；成功后对返回的 active session 调用现有 Desktop workspace switch。缺凭据则等待 ConnectionPanel 既有密码流程完成后再开桌面。

- [x] **Step 1: 写失败测试**：验证每次点击 Local 都创建独立 Local Desktop tab；切换和关闭 Local tabs 不影响本机 target；点击 SSH 主机复用 `connectSaved`，成功后显示对应 session 的 Desktop；打开 Local 不调用 SSH。
- [x] **Step 2: 运行 RED**：Store tab lifecycle 断言在实现前失败；实现后与 Desktop/SSH E2E 行为通过。
- [x] **Step 3: 最小实现**：增加 Local Desktop tabs state/actions；将 SSH saved-card 连接流程接到既有密码提示并在成功后调用现有 Desktop workspace switch；沿用现有 target-aware snapshot。
- [x] **Step 4: 验证 GREEN**：Store 与 Playwright 均通过；验证 Local 不创建 SSH session、saved SSH host 打开对应 Desktop，以及 Local/SSH Desktop 直接切换。

### Task 3: 标签栏和 Desktop 内容路由

**Files:**
- Modify: `src/App.tsx`, `src/components/desktop/DesktopPanel.tsx`, `src/App.css`, `src/styles/home.css`, `src/i18n/locales/zh-CN/shell.json`, `src/i18n/locales/en/shell.json`
- Test: `e2e/home-host-directory.spec.ts`, `e2e/app-shell.spec.ts`

- [x] **Step 1: 写失败测试**：断言标签栏能渲染 Local Desktop tab；点击标签激活 Local target 和 Desktop view；点击 Home 回目录；Home 无收起按钮；右上角无新增 AI/Desktop 快捷入口；原 Hosts sidebar view 和新建 SSH 按钮仍工作。
- [x] **Step 2: 运行 RED**：Home host directory E2E 在实现前因入口不存在而失败。
- [x] **Step 3: 最小实现**：在 Home 标签栏渲染 Local Desktop tab 并接入开关/关闭动作；SSH session tab 打开时渲染现有 DesktopPanel。对应用现有 DesktopPanel，不创建第二套 Desktop UI。Home 标题栏不出现 sidebar collapse control。
- [x] **Step 4: 验证 GREEN**：Home directory E2E 覆盖标题栏快捷入口隐藏、Local/SSH Desktop tabs、Local Terminal/chat 入口；全量 E2E 通过。

### Task 4: 0.1.3 文档与完整回归

**Files:**
- Modify: `docs/TEST_MATRIX.md`, `README.md`, `RELEASE_NOTES.md`, `CHANGELOG.md`, version metadata in `package.json` and `src-tauri/tauri.conf.json` (only where current release process requires)
- Test: `node scripts/check-no-agent-hardcoding.mjs`, `./scripts/run-all-tests.sh`

- [x] **Step 1: 写失败契约检查**：扩展 `scripts/smoke-product-checklist.mjs` 覆盖 Home 主机目录、Local 置顶、Desktop tabs 与 Home controls；先验证静态契约缺失，再实现 wiring。
- [x] **Step 2: 更新产品文档**：已更新 0.1.3 Home 主机目录、Local/SSH Desktop 流程、测试矩阵、发布说明和版本元数据。
- [x] **Step 3: 验证静态检查**：`node scripts/check-no-agent-hardcoding.mjs` 与 `npm run test:smoke` 均通过。
- [x] **Step 4: 全量验证**：`./scripts/run-all-tests.sh` 全部通过；执行 Home directory、Local/SSH Desktop、现有 SSH Terminal 的 Playwright 路径。
- [ ] **Step 5: 提交**：每个实现任务各一提交，作者 `Yunfei Wang <wiselyman2008@gmail.com>`，不含 Cursor 署名；全量测试通过后按仓库要求推送 `main`。

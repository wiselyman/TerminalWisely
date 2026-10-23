# TerminalWisely 0.0.8 全产品 UI 与交互升级实施计划

**Goal:** 在保留现有工作区能力、用户路径与业务行为的前提下，统一 TerminalWisely 全产品的桌面视觉和交互反馈，覆盖明暗主题与三平台差异，并以 Playwright 截图及交互回归验收。

**Architecture:** 规范和评估见 `docs/superpowers/specs/2026-10-23-terminalwisely-ui-0-0-8.md`。共享 token/控件样式按壳层、共享工作台、Home、K8s、数据库、AI、文件/桌面等子系统拆分到 `src/styles/`；组件规则放在 `src/components/` 的共享组件，具体业务样式跟随子系统；`App.tsx` 仅承载空间组合和布局行为。分阶段迁移 `App.css`，避免引入组件到样式层的反向依赖。

**Tech Stack:** React 19、TypeScript、Vite、现有 CSS 变量与 CSS Modules/普通 CSS、Vitest、Playwright。除非现有依赖无法实现，不新增运行时依赖。

**Spec:** `docs/superpowers/specs/2026-10-23-terminalwisely-ui-0-0-8.md`

**Global constraints:** 不改变功能、数据行为、主要操作路径、会话/标签语义或平台原生窗口行为；保留中英文、明暗主题及现有安全/审批机制；每项任务遵守测试先行，计划外不加行为；不得引入 AGENTS.md 禁止的硬编码。

**Review Focus:** CSS 覆盖顺序和样式归属；窄窗口下布局溢出；对焦点、审批和危险操作反馈的影响；各阶段截图与既有交互是否一致；主题切换和平台 class 是否完整。

---

## 要保住的旧行为

- Home 打开时没有 Hosts 侧栏或 Home 工作区标签，Terminal 从左边缘开始并与本机聊天并列；拖动分隔栏与键盘方向键调整比例，比例可恢复。
- Home 第一个 Terminal 固定不可关闭，后续 Terminal 可关闭；Home 的加号创建本机 Terminal，不创建 SSH 连接。
- Hosts、Kubernetes、数据库空间可相互切换，非 Home 空间不显示 Home 页签；主题和语言跨空间保持。
- SSH 会话、K8s 资源、数据库连接/查询、AI 聊天、文件预览/编辑、本地文件和桌面 Dock 的现有操作及错误/审批语义保持。
- 菜单、弹窗和工作台保留现有键盘操作；当前选中、焦点、加载、成功、错误及危险操作仍能被用户识别。
- macOS、Windows、Linux 保留各自标题栏、字体和窗口控件行为。

## 架构

- 共享语义 token 与基础控件规则位于 `src/styles/tokens.css`、`src/styles/primitives.css`；壳层及空间导航、Home 分栏、Hosts/K8s/DB/AI/文件与桌面分区样式分别落在 `src/styles/` 对应文件，并由 `src/App.tsx` 按明确顺序导入。
- 按子系统渐进搬迁现有 `src/App.css`，每阶段只删除已经迁移且有验收覆盖的规则；不重写业务组件，不把业务状态逻辑放入 CSS。
- Playwright 截图基线与交互用例放在 `e2e/`；用固定 Chromium 与固定视口/测试数据，明暗主题分别存档；测试矩阵更新 `docs/TEST_MATRIX.md`。
- 全量静态/单元/集成/E2E/Rust/Sidecar 检查由仓库的 `./scripts/run-all-tests.sh` 执行。

## 设计

- 用户仍按现有路径选择 Home/Hosts/Kubernetes/数据库空间，使用标签打开会话，进入工作台后操作其工具栏、列表或表单。
- 统一表面层级、控件尺寸、4px 间距、字体层级、边框、焦点环、选择/悬停/禁用状态；保留高密度工作台的有效信息，不使用大块空白替代内容。
- Home 左侧 Terminal 占据完整左工作区，右侧为聊天，边界可拖动和键盘调整；两端加载、空态和错误分别在自身区域反馈。
- 工作台加载、成功、失败、审批和危险操作复用原有业务结果与本地化文案，统一视觉反馈位置和层级；不新增确认步骤或操作。
- 视口变窄时重排、压缩或隐藏次要信息；弹窗/菜单不遮挡触发上下文；平台原生窗口控件与字体按当前平台保留。

## 任务

### 1. 建立视觉回归基线与全界面审计记录

**Files:** `e2e/ui-visual-baselines.spec.ts` (new), `e2e/__screenshots__/...` (new), `docs/superpowers/specs/2026-10-23-terminalwisely-ui-0-0-8.md`, `docs/TEST_MATRIX.md`

- [x] 先新增 Playwright 用例，固定 Chromium、视口、测试数据，覆盖 Home、Hosts、Kubernetes、数据库、AI 聊天、文件预览、设置/弹窗的 dark/light 截图及窄窗口溢出/焦点可见断言；执行 `npm run test:e2e` 并确认新增截图断言失败或基线缺失。
- [x] 记录每个界面的视觉、层级/密度、发现性、状态、键盘和缩放观察；按使用频率与影响面确认 P0–P2 次序。
- [x] 在当前视觉状态建立可审阅的初始基线；更新 `docs/TEST_MATRIX.md`；运行 `npm run test:e2e`。

### 2. 共享 token、焦点和基础控件规范

**Files:** `src/styles/tokens.css` (new), `src/styles/primitives.css` (new), `src/App.tsx`, `src/App.css`, `src/**/*.test.ts` (new/updated)

- [x] 先添加 token 与焦点/按钮/输入/表面/状态的样式契约测试，确认暗亮主题 token、平台 class 与可见焦点契约失败；运行对应 `npm test -- --run`。
- [x] 建立语义颜色、字体、间距、边框、状态和焦点规则；从 App.css 搬迁已覆盖的 token 与基础规则，检查主题和平台差异。
- [x] 运行 `npm test -- --run`、`npm run build` 和对应暗亮截图回归。

### 3. 应用壳层、空间导航、标签与 Home 分栏

**Files:** `src/styles/shell.css` (new), `src/styles/home.css` (new), `src/App.tsx`, `src/App.css`, `e2e/app-shell.spec.ts`, `e2e/home-local-terminal-chat.spec.ts`

- [x] 先扩展交互测试：空间切换、Home 固定 Terminal 标签、加号、分隔栏拖动/键盘、主题/locale 持续、可见焦点及 1024/1440 宽度布局；执行相关 E2E 并观察预期失败。
- [x] 统一壳层、导航、活动标签、空状态、Home 分栏和焦点样式；保持现有状态与平台原生窗口行为；拆分对应 CSS。
- [x] 运行 `npm run test:e2e -- app-shell home-local-terminal-chat` 并更新 dark/light 基线。

### 4. Hosts/SSH 与 Kubernetes 工作台

**Files:** `src/styles/management.css` (new), `src/styles/k8s.css` (new), `src/components/management/**`, `src/components/k8s/**`, `src/App.css`, 对应 `e2e/*.spec.ts`

- [x] 先补 Hosts 连接/列表/终端和 K8s 列表、详情、YAML、审批、错误反馈的视觉/交互基线；执行相关 Playwright，确认断言能覆盖状态和焦点。
- [x] 统一目录树、列表、表格、工具栏、表单、资源详情和状态提示；按阶段从 App.css 搬迁规则，不改资源操作语义。
- [x] 运行 SSH、K8s 工作台相关 E2E 和暗亮截图。

### 5. 数据库与 AI 聊天工作台

**Files:** `src/styles/database.css` (new), `src/styles/ai-chat.css` (new), `src/components/db/**`, `src/components/aiEngineer/**`, `src/App.css`, 对应 `e2e/*.spec.ts`

- [x] 先扩展 DB 连接/查询/结果/维护审批和 AI 输入/流式/工具状态的 dark/light、焦点及窄视口 Playwright 覆盖；执行并观察失败。
- [x] 统一高密度表格、编辑器、连接表单、聊天消息、工具轨迹、composer、审批和错误反馈；保留已有引擎差异及交互。
- [x] 运行数据库和 AI 相关 E2E、截图基线。

### 6. 文件、桌面、设置、菜单与弹窗

**Files:** `src/styles/files.css` (new), `src/styles/desktop.css` (new), `src/styles/dialogs.css` (new), 对应组件及 E2E

- [x] 先补文件预览/本地文件、桌面 Dock、设置、菜单、弹窗的截图、Escape/焦点、保存成功/失败与窄视口断言；确认新增覆盖能检测回归。
- [x] 统一文件树/预览工具栏/桌面面板/设置表单/菜单/弹窗/Toast 的层级和状态；保留文件编辑、危险操作确认和快捷键语义。
- [x] 运行相关 E2E 与 dark/light 截图，逐步删除已迁移旧规则。

### 7. 全量回归与交付记录

**Files:** `docs/TEST_MATRIX.md`, `docs/superpowers/specs/2026-10-23-terminalwisely-ui-0-0-8.md`

- [x] 运行 `node scripts/check-no-agent-hardcoding.mjs` 并通过。
- [x] 运行 `./scripts/run-all-tests.sh` 并通过；不得跳过 E2E、Rust 或 Sidecar。
- [x] 检查所有基线、三平台相关 class、双主题、键盘焦点和窄窗结果；记录尚不能自动化的真机项及实际验证限制。
### 8. 完成页面样式从旧总表迁入子系统文件

**Files:** `src/App.css`, `src/styles/{management,k8s,database,ai-chat,files,desktop,dialogs}.css`, `src/lib/chromeContract.test.ts`, `e2e/ui-visual-baselines.spec.ts`

- [x] 先增加样式归属契约，要求代表性的旧工作台选择器必须位于所属样式模块、`App.css` 不再包含这些域选择器；先运行 Vitest 并确认失败。
- [x] 分阶段迁移 Hosts/K8s、数据库、AI、文件/桌面/弹窗的连续规则块；每次保持级联顺序与所有功能状态不变，运行对应单元/E2E与暗亮视觉回归。
- [x] 完成后复核 `App.css` 职责仅保留尚未迁移的特有规则，更新测试矩阵与规范。

### 9. 跨平台原生渲染检查

**Files:** `.github/workflows/**` (only if CI lacks required OS coverage), `docs/superpowers/specs/2026-10-23-terminalwisely-ui-0-0-8.md`

- [x] 核查 GitHub Actions 是否已对 macOS、Windows、Linux 执行构建与 E2E；先补工作流契约检查并确认 Windows UI E2E 缺失时失败。
- [x] 为 Windows runner 增加原生 PowerShell E2E harness，并在 Windows 矩阵启用 Playwright；Linux 现有矩阵保持，平台截图仅在 macOS 维护。
- [ ] 推送后核实最新 commit 的 Linux/Windows CI 结果；没有结果时保留未验收状态，不将本机结果描述为三平台完成。

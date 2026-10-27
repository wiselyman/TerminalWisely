# Home 本机桌面工作区实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home 可切换到完整本机 Desktop；Files、Processes、Browser、Terminal、MarkWisely 在 Local 与 SSH 目标上使用同一套 UI，且目标状态隔离。

**Architecture:** 定义显式 `DesktopTarget` 联合类型并按目标保存窗口/应用状态；各应用通过目标感知的 provider 路由到现有 SSH 命令或本机 Tauri 命令。本机 PTY 与 Home 终端标签连续；Windows 发行包嵌入固定版本 Coreutils，只影响应用启动的 PowerShell 5.1。

**Tech Stack:** React、TypeScript、Zustand、Tauri 2、Rust、sysinfo、Playwright、Vitest、Cargo tests、GitHub Actions。

**Spec:** 用户批准的 0.1.0 方案（本轮对话）。

## 全局约束

- 只在 `main` 开发；本次不得改变现有 SSH Desktop 行为或已确认的 Home Terminal/聊天语义。
- Local 与 SSH 目标必须使用显式 discriminated union；禁止使用伪造 session ID 代表本机。
- 本机文件/进程调用只能触达 Local provider；SSH 文件/进程调用继续携带真实 SSH `sessionId`。
- AI Linux 只对 SSH 目标可见；Home 本机聊天继续由既有聊天面板提供。
- Windows 继续使用系统 PowerShell 5.1；Coreutils 仅注入应用子进程环境，不修改系统 PATH、用户 Profile 或注册表。
- 每个任务先写失败测试、观察 RED，再实现最小修复并验证 GREEN；每个任务单独提交，作者为 `Yunfei Wang <wiselyman2008@gmail.com>`。
- 最终必须通过 `node scripts/check-no-agent-hardcoding.mjs` 与 `./scripts/run-all-tests.sh`。

## 要保住的旧行为

- Home 首次进入仍显示固定的第一个本机 Terminal 标签，聊天默认收起；切换到 Home Desktop 再返回时，当前 PTY、终端输出与聊天内容仍在。
- Hosts Desktop 的每个 SSH 会话仍恢复自己的应用窗口、目录、浏览器标签和焦点顺序；Home 的 Local 状态不会覆盖任一 SSH 快照。
- Host Terminal 继续复用当前 SSH 终端，Host Files/Processes/MarkWisely 继续操作当前 SSH 主机。
- Local Files 的根目录仍由 `list_local_roots` 返回；读取失败显示当前应用错误区，不回退到 SSH 或静默改目标。
- Windows 系统 Shell 仍是 `powershell.exe` 5.1；启动/关闭 Home Desktop 不得改写用户 PowerShell 配置或全局环境变量。

## 架构

- `src/lib/desktopTarget.ts`：定义 `DesktopTarget = { kind: "local" } | { kind: "ssh"; sessionId: string }`、稳定键和 provider 路由工具；Local key 固定为内部常量 `local`，SSH key 使用 session id 的命名空间。
- `src/stores/desktopStore.ts`、`hostWorkspaceMemory.ts`、`workspacePanelSwitch.ts`：Desktop 状态按 target key 快照；Home 与 Host 复用桌面壳和应用窗体；Home Desktop 开关接入既有顶栏模式入口。
- `src/components/desktop/LocalDesktopFileManager.tsx`、`FileManagerPanel.tsx`、`src/lib/localFsApi.ts`、`src-tauri/src/fs_local.rs` 与 Tauri commands：共享 Files 窗口根据明确 target 切换 provider；Local 使用独立本机视图避免 SSH 面板的 session-bound 搜索/传输逻辑，本机与 SSH 文件行为隔离。
- `src/stores/markWiselyStore.ts`、MarkWisely 窗口/选择器：按 target 保存文档与最近文件；Local 文档使用本机文件接口，SSH 文档继续使用 preview handle。
- `src/stores/taskManagerStore.ts`、`src-tauri/src/process/local.rs`：本机进程枚举/结束由 Rust provider 提供；SSH 仍使用已有 `list_processes`/`kill_process`。
- `src/stores/browserStore.ts`、浏览器 Tauri commands：按 target 保存标签；本机 Browser 不建立 SSH SOCKS 通道，SSH Browser 保持现状。
- `src/components/home/LocalTerminal.tsx`、Home/Desktop terminal portal：Home Desktop Terminal 挂载当前 Home PTY，不创建第二个 PTY。
- Windows 资源脚本、`src-tauri/tauri.conf.json`（必要时平台覆盖配置）、`.github/workflows/release.yml`：按 Windows target 下载并校验 Coreutils v2026.9.3 ZIP，打包 x64/ARM64 对应文件和许可证声明。

依赖方向：界面 → target-aware store/provider → Local Tauri 命令或现有 SSH 命令。Local provider 不得依赖 SessionStore；SSH provider 不得从本机路径推断 session。

## 设计

- 用户在 Home 点击与 Hosts 相同的 Desktop 按钮进入本机桌面；点击 Terminal/聊天模式入口返回 Home 终端与聊天。Desktop menubar 显示本机主机名，Dock 提供 Files、Processes、Browser、Terminal、MarkWisely，不显示 AI Linux。
- Home Files 初次打开显示本机根目录选择/文件树；操作成功后刷新当前目录，失败在文件工作区展示错误。文件夹新建、重命名、移动、删除沿用 Desktop 对话框与危险操作确认；本机文本/Markdown 预览、MarkWisely 保存操作本机路径。
- Processes 加载时显示现有 loading 状态；列表失败显示现有 error 区；结束进程仍使用当前进程行的确认交互，成功后刷新，失败保留行并展示错误。
- Browser 打开本机目标时复用现有 Browser UI 和本机 WebView，不配置 SSH SOCKS；加载错误显示浏览器页面现有错误反馈。SSH 浏览器 profile/key 与行为不变。
- Terminal 应用窗口将当前 Home Terminal 标签的 xterm/PTTY 移入窗口 host；关闭/最小化桌面窗口不停止 PTY，关闭 Home Terminal 标签仍按既有规则停止对应 PTY。
- Windows Coreutils 在应用启动 PowerShell 会话内置于 PATH 前端，并对重名 alias 做 session-local 解析处理；命令可用性受系统文件/权限约束时以 PowerShell 原生错误呈现，不提升权限。

## Review Focus

- 快速来回切换 Local 与 SSH 时，延迟响应不得把文件/进程操作发往错误目标；Store/provider 单测覆盖发往正确 command 且 payload target/session 匹配。
- 关闭 Home Desktop 时不能停止正在运行的 Home PTY；Playwright 覆盖切换后同一 terminal id 和 shell state 延续。
- 本机文件名含 Unicode、空格、Windows 盘符/UNC 路径时必须保留路径并正确操作；Rust 单测覆盖这些路径。
- 本机进程退出或 PID 在刷新之间复用时不得错误隐藏/结束另一进程；Rust 测试覆盖退出/已结束错误。
- Windows 安装包的 Coreutils 版本/架构资源缺失或校验失败时，打包必须失败，不能静默发出没有命令的版本；资源脚本测试覆盖失败路径。

---

### Task 1: 显式 Desktop Target 与隔离的工作区状态

**Files:**
- Create: `src/lib/desktopTarget.ts`
- Modify: `src/stores/desktopStore.ts`, `src/stores/hostWorkspaceMemory.ts`, `src/stores/workspacePanelSwitch.ts`, `src/App.tsx`, `src/components/desktop/DesktopPanel.tsx`, `src/components/desktop/DesktopDock.tsx`, `src/components/desktop/DesktopIcons.tsx`
- Test: `src/lib/desktopTarget.test.ts`, `src/stores/desktopStore.test.ts`, `src/stores/hostWorkspaceMemory.test.ts`, `e2e/home-local-terminal-chat.spec.ts`

**Interfaces:**
- Produces: `DesktopTarget`, `desktopTargetKey(target): string`, `isSshDesktopTarget(target): target is { kind: "ssh"; sessionId: string }`。
- Desktop state actions 接收完整 target；SSH wrapper 保留兼容入口并映射到 `{ kind: "ssh", sessionId }`。

- [x] **Step 1: 写失败测试**：target key 对 Local 固定、SSH 以 session id 隔离；打开 Local Desktop、Host A、Host B 后分别恢复独立应用/窗口/焦点状态；Host API 仍只调用原 session。
- [x] **Step 2: 运行 RED**：新 target 接口和 Store 行为在实现前失败。
- [x] **Step 3: 最小实现**：新增 target 类型与 key；按 key 保存/恢复 Desktop snapshot；Home Desktop 按钮打开 `{kind:"local"}`，Home 终端/聊天入口返回 Home workspace；不渲染 Local AI Linux。
- [x] **Step 4: 验证 GREEN**：定向 Vitest 14 项通过；`npm run build` 通过；运行 `npm run test:e2e -- --grep "Home local Desktop target isolation"`，断言 Home↔Desktop 单击切换和 Local/SSH 状态隔离通过。
- [x] **Step 5: 提交**：`feat: add isolated local desktop target`。

### Task 2: Local Files provider 与本机文件操作

**Files:**
- Create: `src/components/desktop/LocalDesktopFileManager.tsx`, `src/lib/localFsApi.ts`
- Modify: `src-tauri/src/fs_local.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`, `src/components/desktop/FileManagerPanel.tsx`, `src/App.tsx`, `src/stores/desktopStore.ts`
- Test: `src-tauri/src/fs_local.rs` unit tests, `src/lib/localFsApi.test.ts`, `e2e/home-local-terminal-chat.spec.ts`

**Interfaces:**
- Consumes: Task 1 `DesktopTarget` / `desktopTargetKey`。
- Produces: Local provider operations for listing roots/directories, create file/folder, read text, write text, rename, move, delete, size and reveal/open; SSH provider continues existing `LocalFsPanel` and session APIs.

- [x] **Step 1: 写失败测试**：Rust 临时目录测试本机创建/读写/重命名/移动/删除和非法路径；Vitest 测试 Local 命令不带 `session_id`、SSH 操作仍使用真实 id。
- [x] **Step 2: 运行 RED**：`cargo test fs_local::tests --lib` 与 `npm test -- --run src/lib/localFsApi.test.ts`，确认缺失的 Local create/read/write API。
- [x] **Step 3: 最小实现**：补齐本机文件操作命令；共享 Files 窗口根据 target 渲染本机文件视图或原 SSH 面板；Local 当前目录/选择状态独立于 SSH session stores。
- [x] **Step 4: 验证 GREEN**：运行上述 Cargo/Vitest；E2E 新建目录、创建文本文件、重命名、移动、删除并验证 SSH 主机目录无变化。
- [x] **Step 5: 提交**：`feat: add local desktop file operations`。

### Task 3: MarkWisely 支持本机文档与隔离最近文件

**Files:**
- Modify: `src/stores/markWiselyStore.ts`, `src/components/desktop/MarkWiselyWindow.tsx`, `src/components/desktop/MarkWiselyFilePicker.tsx`
- Test: `src/stores/markWiselyStore.test.ts`, `e2e/home-local-desktop.spec.ts`

**Interfaces:**
- Consumes: Task 1 target model and Task 2 local file read/write/create/list operations。
- Produces: Target-aware document open/create/save/close and recent-file buckets; Local documents do not allocate SSH preview handles.

- [x] **Step 1: 写失败测试**：Local 文档新建/打开/保存走本机命令；Local 与每个 SSH host 最近文件隔离；SSH 仍调用 preview handle API。
- [x] **Step 2: 运行 RED**：`npm test -- --run src/stores/markWiselyStore.test.ts`，确认 Local 操作仍走 SSH preview API。
- [x] **Step 3: 最小实现**：以 target key 管理文档与 recents；按 target 选择本机文件接口或 SSH preview 接口；复用现有文件夹选择器和未保存确认。
- [x] **Step 4: 验证 GREEN**：重跑 Vitest；E2E 覆盖本机新建、打开、修改、保存、最近文件重开、未保存关闭确认。
- [x] **Step 5: 提交**：`feat: support local markdown workspace`。

### Task 4: 本机 Processes provider

**Files:**
- Create: `src-tauri/src/process/local.rs`
- Modify: `src-tauri/src/process/mod.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`, `src/stores/taskManagerStore.ts`, `src/components/desktop/ProcessManagerPanel.tsx`
- Test: Rust local process tests, `src/stores/taskManagerStore.test.ts`, `e2e/home-local-desktop.spec.ts`

**Interfaces:**
- Consumes: Task 1 `DesktopTarget`。
- Produces: Local process list and kill commands mapped to existing `ProcessEntry` fields; SSH remains on `list_processes` / `kill_process`。

- [x] **Step 1: 写失败测试**：用受控子进程证明 Local list 返回 PID/name/command/resource metrics，kill 只结束该 PID；不存在/已退出 PID 返回错误且不影响其他进程。Store Local/SSH routing 单测验证 command/payload。
- [x] **Step 2: 运行 RED**：`cargo test process::local::tests --lib` 与 `npm test -- --run src/stores/taskManagerStore.test.ts`。
- [x] **Step 3: 最小实现**：基于已存在的 `sysinfo` 提供跨平台本机列表/结束；Store 的缓存/tombstone 按 target key 分桶，面板的筛选、排序、刷新与确认 UI 共用。
- [x] **Step 4: 验证 GREEN**：重跑 Cargo/Vitest；Playwright 验证 Home 本机进程列表与结束，Host 进程仍调用 SSH command。
- [x] **Step 5: 提交**：`feat: manage local desktop processes`。

### Task 5: Local Browser 与 Home PTY 移入 Desktop Terminal

**Files:**
- Modify: `src/stores/browserStore.ts`, `src/components/desktop/DesktopPanel.tsx`, `src/components/desktop/DesktopTerminalWindow.tsx`, `src/components/home/LocalTerminal.tsx`, `src/components/home/HomeWorkspace.tsx`, browser Tauri commands/`src-tauri/src/lib.rs`
- Test: `src/stores/browserStore.test.ts`, `e2e/home-local-desktop.spec.ts`, Home terminal E2E regression

**Interfaces:**
- Consumes: Task 1 target state and shared Desktop app routing。
- Produces: Local Browser ensure/visibility lifecycle without SSH proxy; Home active terminal portal attaches existing PTY to Desktop Terminal window and restores it when returning Home。

- [ ] **Step 1: 写失败测试**：Browser Local 与 Host bucket 隔离、Local 不调用 SSH/SOCKS ensure；Desktop Terminal 进入/离开时 `local_terminal_start` 只发生一次且当前 PTY id 不变。
- [ ] **Step 2: 运行 RED**：`npm test -- --run src/stores/browserStore.test.ts` 和 `npm run test:e2e -- --grep "Home desktop browser and terminal continuity"`。
- [ ] **Step 3: 最小实现**：按 target 管理 Browser bucket，新增 Local WebView 创建路径；通过 stable portal 移动 active Home xterm，不重建 PTY；Home 多终端 tab 切换与关闭语义不变。
- [ ] **Step 4: 验证 GREEN**：重跑上述测试；额外验证 Host Browser/Terminal E2E 回归。
- [ ] **Step 5: 提交**：`feat: add local desktop browser and terminal continuity`。

### Task 6: Windows 安装包内置 Coreutils

**Files:**
- Create: `scripts/fetch-windows-coreutils.ps1`, `scripts/fetch-windows-coreutils.test.mjs`
- Modify: `src-tauri/tauri.conf.json` or Windows platform override, `src-tauri/src/local_terminal.rs`, `.github/workflows/release.yml`, `docs/TEST_MATRIX.md`
- Test: Coreutils provisioning script tests, Rust shell environment tests, Windows CI package smoke

**Interfaces:**
- Consumes: official Microsoft Coreutils v2026.9.3 x64/ARM64 ZIP assets and asset digest; PowerShell 5.1 remains the shell。
- Produces: target-specific bundled Coreutils resource directory added to child PowerShell PATH; collision aliases are removed/overridden only in that child session.

- [ ] **Step 1: 写失败测试**：script tests reject unknown architecture, digest mismatch and missing binary/license; Rust environment test confirms Coreutils path precedes existing PATH and parent process environment is unchanged.
- [ ] **Step 2: 运行 RED**：`node --test scripts/fetch-windows-coreutils.test.mjs` 与 `cargo test local_terminal::tests --lib`。
- [ ] **Step 3: 最小实现**：按 Windows matrix target 拉取固定版本、验证 GitHub asset digest、解包 binary/NOTICE/license，打包至应用资源；构造 PowerShell 5.1 session-local PATH/alias 启动命令，不调用安装器或写用户配置。
- [ ] **Step 4: 验证 GREEN**：运行定向测试；Windows x64/ARM64 CI 断言安装包资源存在，PowerShell 内 `Get-Command ls` 指向 bundled Coreutils，同时验证 `$PROFILE`、全局 PATH 未修改。
- [ ] **Step 5: 提交**：`build: bundle Windows Coreutils for local terminal`。

### Task 7: 全量回归、测试矩阵和用户文档

**Files:**
- Modify: `docs/TEST_MATRIX.md`, `README.md`, `RELEASE_NOTES.md`, `CHANGELOG.md`（按仓库现状追加 0.1.0 段落）
- Test: existing CI and full project test suite

- [ ] **Step 1: 写失败/缺失契约测试**：扩展 `scripts/smoke-product-checklist.mjs` 检查 Local Dock 隐藏 AI Linux、Home Desktop toggle 和 Windows resource mapping。
- [ ] **Step 2: 运行 RED**：`npm run test:smoke`，确认新产品契约尚未登记。
- [ ] **Step 3: 更新文档**：补上 Local/SSH Desktop 能力矩阵、Windows PowerShell/Coreutils 兼容说明和 Home Desktop 用户路径。
- [ ] **Step 4: 全量验证**：依次运行 `node scripts/check-no-agent-hardcoding.mjs`、`./scripts/run-all-tests.sh`，再执行 `git diff --check`；Windows E2E/package 由 GitHub Actions 矩阵通过。
- [ ] **Step 5: 提交**：`docs: document Home local desktop workspace`。

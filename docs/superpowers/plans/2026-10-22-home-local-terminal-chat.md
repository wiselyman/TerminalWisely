# Home 本机终端与聊天简化计划

## 目标

Home 固定为左右两栏：左侧是可交互的本机终端，右侧是本机聊天。Windows 使用 PowerShell，其他平台使用系统默认 shell。删除当前未发布的 0.0.7 功能，保留这套终端与聊天布局和原有 0.0.6 运维能力。

## 要保住的旧行为

- 打开 Home 不创建 SSH 会话；主机 SSH 标签页仍连接到用户选定的远端。
- K8s、数据库和主机工作区仍由各自侧栏视图打开，切换 Home 不会关闭其已打开的工作区。
- Home 聊天仍绑定本机上下文；聊天发送、停止、批准和历史记录仍使用现有 AI Engineer 面板行为。
- 本机终端接受键盘输入、保留交互式进程输出，并在尺寸变化时调整 PTY 大小。
- 关闭 Home 或应用时释放本机 PTY；远端终端和 K8s Shell 的会话生命周期不变。

## 架构

| 文件 | 职责 |
|------|------|
| `src/components/home/HomeWorkspace.tsx` | 固定双栏布局，移除网页/命令快照/文件页签、项目绑定、钉住和拖动宽度等工作面状态；左侧挂本机终端，右侧复用 `AiEngineerPanel`。 |
| `src/components/home/LocalTerminal.tsx` | 复用 `TerminalView` 使用的 xterm 外观与字体主题，管理本机终端 Tauri 命令的创建、输入、输出、resize 和关闭。 |
| `src-tauri/src/local_terminal.rs`、`src-tauri/src/commands/mod.rs`、`src-tauri/src/lib.rs` | 基于现有 `portable-pty` 建立本机 PTY；按平台选择系统 shell（Windows PowerShell，其他平台的默认 shell）；通过事件发送输出并提供输入/resize/close 命令。 |
| `src/App.tsx`、`src/App.css` | Home 使用简洁双栏；移除 0.0.7 工程标签与入口，同时保留原有主机/K8s/DB 导航和窗口壳。 |
| `src/lib/aiEngineer/*`、`src/stores/*`、`agent-sidecar/app/*`、`src-tauri/src/browser.rs` | 删除仅服务于 0.0.7 Home 工作面、网页自动化、操作工程和技能回放的新增行为；恢复已有通用聊天、AI 工具与远端浏览器行为。 |
| 测试 | 用 Vitest 和 Playwright 锁定双栏及本机聊天路径；Rust 单测覆盖 shell 选择与 PTY 生命周期；更新测试矩阵并通过全量脚本。 |

依赖方向：Home 终端组件只调用本机终端命令；Rust PTY 不依赖 Sidecar 或操作工程；聊天仍经现有 `AiEngineerPanel` 与 Sidecar 通信。删除的 Home 网页自动化不再向 Sidecar 注册工具。

## 设计

- 用户打开 Home 后，主工作区左侧显示一个立即启动的交互式终端，右侧显示本机聊天输入和消息。
- 左侧终端复用现有 xterm 字体、主题与面板边框。终端启动期间在终端区域显示现有加载样式；启动失败时在该区域显示错误和重试入口。
- 终端启动成功后显示 shell 提示符。输入、控制字符、终端尺寸变化和退出状态由 PTY 透传；不显示网页、文件、操作工程或技能页签。
- 右侧继续复用当前 AI Engineer 聊天面板的加载、执行、批准、失败和停止反馈。
- 分栏复用现有 `.workspace-split`、`terminal-stack` 和聊天面板壳；Home 双栏宽度均分，不增加可拖动分隔条。
- Windows 启动 PowerShell；Unix 系统从进程环境解析默认 shell，无法解析时使用系统登录 shell。

## 任务

### 任务 1：锁定 Home 简化后的行为

- [x] 先添加并运行失败的 Playwright 用例：Home 展示本机终端与聊天；网页/命令/文件/操作工程入口不出现；其他侧栏视图仍可切换。
- [x] 添加并运行本机终端 Rust 测试：平台 shell 选择、PTY 输出。

### 任务 2：接入交互式本机 PTY

- [x] 在 Rust 新模块封装本机 PTY，注册 start/input/resize/close 命令与输出事件。
- [x] 添加 Home 本机 xterm 组件，覆盖启动失败反馈和卸载清理。
- [x] 单独运行前端与 Rust 对应测试。

### 任务 3：回退 0.0.7 Home/操作工程功能

- [x] 将 Home 简化为本机终端 + 聊天，移除 Home 网页、文件和命令快照工作面及其 store、工具与样式。
- [x] 移除操作工程、工程聊天隔离、技能点确认/回放及相关 Sidecar API、工具和界面。
- [x] 回退其余仅为 0.0.7 新功能增加的产品改动，保留本计划所需双栏、终端和聊天改动以及原有 0.0.6 功能。
- [x] 删除已移除功能绑定的测试，保留未发布开发期间的历史计划/规格文档；更新 `docs/TEST_MATRIX.md`。
- [x] 运行相关前端、Sidecar、Rust 与 E2E 测试。

### 任务 4：全量验证与收口

- [x] 运行 `node scripts/check-no-agent-hardcoding.mjs`。
- [x] 运行 `./scripts/run-all-tests.sh` 并确认全量通过。
- [x] 走 Playwright Home 双栏路径，确认切换至 Hosts/K8s/DB 后原有入口仍工作。
- [x] 检查最终 diff，确认没有遗留 Home 网页/工程/技能入口或无关改动。

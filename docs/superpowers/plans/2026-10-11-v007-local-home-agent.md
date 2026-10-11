# 0.0.7 Home 本机 Agent

确认后先把本文写入仓库，三块写全再改产品源码。不恢复本地终端页签，不按软件名加白名单。

## 要保住的旧行为

- 打开 Home 不发起 SSH、不连集群、不连数据库。
- 主机标题栏加号仍是「添加服务器」；Kubernetes / 数据库的加号仍打开原来的表单。
- 离开 Home 后，主机、集群、数据库各自的侧栏聊天、范围和 `engineerMode` 不变。直接数据库连接仍然不提供 `terminal_exec`。
- 远程命令仍只在已有 SSH 会话上调用 `exec_command_capture`。不新增第二次 SSH，不用 PTY 去刮输出。
- 主机列表不出现本地终端。`scripts/smoke-product-checklist.mjs` 里 `create_local`、`portable-pty`、`local_shell.rs` 的禁止项继续通过。
- 现有 `terminalwisely` MCP 对远程主机、集群、数据库的工具名单不变。变更仍经 CommandBroker 和批准租约。

## 架构

Home 的模型只看见 MCP 工具。进程内服务器仍是 `agent-sidecar/app/runtime/tw_mcp.py` 的 `terminalwisely`。Home 的内置循环也只调用它。

本机运行带 `target: "local"`。`terminal_exec` 经批准后，WebView 调 `ai_local_exec`。其它 scope 仍调 `ai_terminal_exec`。

`terminalwisely` 在 `target=local` 时列出的工具只有：`terminal_exec`、`web_search`、`web_fetch`、`ask_user`。办公和驱动浏览器窗口来自用户自己接上的 MCP 服务器。应用不识别具体软件名。外部工具结果是不可信数据，不能直接在本机起进程。

本机捕获在 `src-tauri/src/local_exec.rs`，用 `std::process` 取 stdout/stderr/退出码，不建 PTY，不进 `SessionManager`。Shell 从环境读取：Unix 用 `SHELL`，缺省 `/bin/sh`；Windows 用 `ComSpec`，缺省 `cmd.exe`。

聊天范围固定为 `local`。三个侧栏的 Home 共用这一条会话。

## 设计

Home 的主区域就是聊天本身，占满原来欢迎页的位置。没有消息时用现有 `empty-state`，文案说明这条聊天对着当前这台电脑，能力来自 MCP。执行卡片、批准条、停止按钮沿用现有壳。

三个侧栏切到 Home 都进入同一条本机聊天。离开 Home 后回到原来的工作区和原来的侧栏聊天。

## 任务

### Task 1: 本机捕获

**Files:** `src-tauri/src/local_exec.rs`, `commands/mod.rs`, `lib.rs`, `ai_engineer/mod.rs`

- [x] **Step 1:** 失败测试（shell argv、stdout、超时形状）
- [x] **Step 2:** 实现 `ai_local_exec`（无 PTY，租约门）
- [x] **Step 3:** `cargo test --lib local_exec` PASS

### Task 2: Home 只走 terminalwisely MCP

**Files:** `tw_mcp.py`, `schema.py`, `interaction_mode.py`, `prompts.py`, `test_tw_mcp_tools.py`, `localTarget.ts`, `toolBridge.ts`, `chatClient.ts`

- [x] **Step 1:** 失败 pytest：local 工具名单、策略、target 标记
- [x] **Step 2:** `target=local` 工具表 + 前端 `ai_local_exec` 分发
- [x] **Step 3:** pytest / vitest PASS

### Task 3: 用户 MCP 服务器

**Files:** `user_mcp.py`, `loop.py`, `test_user_mcp.py`

- [x] **Step 1:** 失败测试：配置、假 stdio、不可信、不二次起进程
- [x] **Step 2:** 读取配置 + `list_tools` / `call_tool` + env
- [x] **Step 3:** pytest PASS

### Task 4: Home 主区域是整块聊天

**Files:** `App.tsx`, `AiEngineerPanel.tsx`, `aiEngineerStore.ts`, `DbWorkbench.tsx`, `App.css`, i18n `tools.json`, e2e

- [x] **Step 1:** 失败 / 更新 e2e：`home-local-chat`，不连 SSH
- [x] **Step 2:** Home 绑定 `local`，离开恢复；docked 面板不盖住
- [x] **Step 3:** e2e / vitest PASS

### Task 5: 收口

- [x] 中英文案
- [x] `node scripts/check-no-agent-hardcoding.mjs`
- [x] `./scripts/run-all-tests.sh`
- [x] `docs/TEST_MATRIX.md` 本机 Home 行

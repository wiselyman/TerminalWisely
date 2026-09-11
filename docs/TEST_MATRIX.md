# TerminalWisely 功能与测试矩阵

> **开发新功能时（Agent / 贡献者必读）**
> 1. 为新功能添加对应层级测试（见 `AGENTS.md`）
> 2. 运行 **`./scripts/run-all-tests.sh`** 且全部 PASS 后再提交
> 3. 更新本矩阵中相关功能行

## 测试层级说明

| 层级 | 命令 | 说明 |
|------|------|------|
| **单元测试** | `npm test` / `cargo test` / `pytest tests/` | 纯函数、策略、模型，无真实 SSH/K8s |
| **集成测试** | `pytest tests/test_api_surface_integration.py` 等 | Sidecar HTTP API、AgentLoop + mock 模型 |
| **静态功能检查** | `node scripts/smoke-product-checklist.mjs` | 前端 wiring、i18n、关键文件存在性 |
| **端到端 (E2E)** | `pytest tests/test_e2e_hard_gates.py` 等 | Pull 协议 + fake 模型完整对话 |
| **SSH 实时连接 / SFTP 上传** | `bash scripts/e2e-ssh-integration.sh` | Docker openssh + Rust `live_integration`（密码/密钥/下载/取消/重连） |
| **K8s 真集群** | `bash scripts/e2e-k8s-integration.sh` | k3d + Rust `k8s::live_integration` |
| **拖拽上传 UI** | `npm run test:e2e` → `e2e/ssh-drag-upload.spec.ts` | Playwright HTML5 drop + mock `upload_files` |
| **用户测试 / UI E2E** | `npm run test:e2e` (Playwright) | AI chat、SSH、K8s、Tab、审批、LocalFS、设置 |

## 跨平台 / 跨架构 CI 矩阵

| Runner | OS | CPU | 测试内容 |
|--------|-----|-----|----------|
| `linux-x86_64` | Ubuntu 22.04 | x86_64 | smoke + Vitest + build + `cargo test` + SSH/K8s live + pytest + Playwright |
| `linux-aarch64` | Ubuntu 24.04 ARM | aarch64 | 同上（含 SSH/K8s live） |
| `macos-aarch64` | macOS latest | Apple Silicon | smoke + Vitest + build + `cargo test` + `cargo check` x86_64 + pytest |
| `windows-x86_64` | Windows latest | x86_64 | smoke + Vitest + build + `cargo check` + `cargo check` ARM64 + pytest |

> Linux 上不做 GTK/Tauri 的跨 GNU 架构编译（需 sysroot）；由 **linux-x86_64** 与 **linux-aarch64** 两个原生 runner 覆盖。  
> macOS Intel / Windows ARM64 安装包由 **Release** workflow 在对应 triple 上构建；CI 在 macOS 上交叉 `cargo check` Intel，在 Windows 上交叉 `cargo check` ARM64。

本地：`bash scripts/cross-arch-rust-check.sh`（Linux 上自动 skip；macOS/Windows 上检查另一架构 triple）。

---

## 1. 应用壳层

| 功能 | 单元 | 集成 | 功能 | E2E | 用户 |
|------|:----:|:----:|:----:|:---:|:----:|
| 自定义标题栏 / 窗口控制 | — | — | smoke | — | ✓ |
| 活动栏 Hosts / K8s 切换 | — | — | smoke | — | ✓ |
| 多 Tab SSH 会话 | Rust shell | — | smoke | — | ✓ |
| Home 欢迎页 | — | — | smoke | — | ✓ |
| i18n 中英文 | — | — | smoke | ✓ | ✓ |
| 语言切换 | — | Playwright `app-shell`/`settings-i18n`（menu portal + html lang） | smoke `locale-switcher` | — | ✓ |
| 应用设置 / 更新检查 | Rust updater | — | smoke | — | ✓ |
| Toast / 状态栏传输进度 | `transferFormat.test` | — | smoke | — | ✓ |

## 2. SSH 终端与会话

| 功能 | 单元 | 集成 | 功能 | E2E | 用户 |
|------|:----:|:----:|:----:|:---:|:----:|
| SSH 连接（密码/密钥） | Rust client | **SSH live** | — | **✓** | ✓ |
| 保存连接 / 设备历史 | — | — | smoke | **✓** | ✓ |
| xterm 终端渲染 | — | — | smoke | — | ✓ |
| 断线重连 | — | **SSH live** | — | — | ✓ |
| Tab 目录快捷方式 | — | — | smoke | — | ✓ |
| OS 探测 (session metadata) | Rust probe | — | — | — | ✓ |
| Sudo 密码弹窗 | — | — | smoke | — | ✓ |

## 3. 终端交互（文件、拖拽、链接）

| 功能 | 单元 | 集成 | 功能 | E2E | 用户 |
|------|:----:|:----:|:----:|:---:|:----:|
| 点击 ls 路径 cd | `terminalLinks` / `terminalContext`（含换行 prompt） | — | smoke | **✓** | ✓ |
| 点击文件预览/下载 | `terminalLinks` / `terminalContext` | — | smoke | **✓** | ✓ |
| 拖拽本地上传 | — | **SSH live + Playwright** | smoke | **✓** | ✓ |
| 跨 Tab 远程拖拽 | — | — | smoke | — | ✓ |
| 路径右键菜单 | — | — | smoke | — | ✓ |
| 终端选区 → AI Chat | — | — | smoke | — | ✓ |
| 插入本地路径命令 | Rust | — | smoke | — | ✓ |

## 4. 文件预览

| 功能 | 单元 | 集成 | 功能 | E2E | 用户 |
|------|:----:|:----:|:----:|:---:|:----:|
| 多 Tab 预览面板 | — | — | smoke | — | ✓ |
| Text/Markdown/HTML/CSV/图片/PDF | Rust preview | — | smoke | — | ✓ |
| 预览内搜索 | `previewSearch.test` | — | smoke | — | ✓ |
| 编辑保存 / sudo 重试 | Rust | — | — | — | ✓ |

## 5. SFTP / 远程文件操作

| 功能 | 单元 | 集成 | 功能 | E2E | 用户 |
|------|:----:|:----:|:----:|:---:|:----:|
| 上传/下载/取消 | Rust scp | **SSH live** | smoke | — | ✓ |
| 跨服务器传输 | Rust | — | — | — | ✓ |
| 重命名/移动/删除/压缩 | Rust fs_remote | — | smoke | — | ✓ |
| 远程 find | — | — | smoke | — | ✓ |
| 路径补全 | Rust | — | — | — | ✓ |

## 6. 本地文件面板 (Local FS)

| 功能 | 单元 | 集成 | 功能 | E2E | 用户 |
|------|:----:|:----:|:----:|:---:|:----:|
| 本地+远程双树 | `localFsTree` | — | smoke | **✓** | ✓ |
| Host 树新建/拖移/剪贴板/多选 | `localFsOps` + Rust `fs_path_tests` | create/copy/move | smoke menu | — | ✓ |
| Host 树局部重载 | `localFsStore.reloadDirectory` | — | — | — | ✓ |
| Host 树 pointer 拖移 | `localFsPointerMove` | — | smoke | — | ✓ |
| Find in files | — | — | smoke | **✓** | ✓ |
| 任务管理器 (进程/kill) | — | — | smoke | **✓** | ✓ |
| 发送到 AI Chat | — | — | smoke | — | ✓ |

## 7. 主机监控

| 功能 | 单元 | 集成 | 功能 | E2E | 用户 |
|------|:----:|:----:|:----:|:---:|:----:|
| 状态栏 CPU/内存/磁盘/网络 | Rust disk_io | — | smoke | — | ✓ |
| `formatSizeHuman` | `formatSize.test` | — | — | — | — |

## 8. Kubernetes 工作台

| 功能 | 单元 | 集成 | 功能 | E2E | 用户 |
|------|:----:|:----:|:----:|:---:|:----:|
| 集群导入 / kubeconfig | — | **K8s live** | smoke | **✓** | ✓ |
| 资源列表/详情/YAML / Pod Volumes 概览 | `podVolumes` | **K8s live** | smoke | **✓** | ✓ |
| Apply/Delete/Scale | — | — | smoke | **✓** | ✓ |
| Pod 日志 / Shell / Port-forward（多端口列表） | `forwardablePorts` | — | smoke | **✓** k8s-ops | ✓ |
| Helm / Overview / 自动刷新 | — | — | smoke | — | ✓ |
| kubectl 工具安装 | — | — | smoke | — | ✓ |

## 9. AI Engineer（Linux + K8s）

| 功能 | 单元 | 集成 | 功能 | E2E | 用户 |
|------|:----:|:----:|:----:|:---:|:----:|
| Sidecar 启动 | — | healthz | smoke | — | ✓ |
| 多线程聊天历史（SQLite 索引 + 按 scope 拉正文；拒空覆盖） | `chatHistoryDisk` / persist | Rust `chat_history` | smoke | — | ✓ |
| AI 工具结束后静默思考 / tool_result 回传 | postToolResult + loop thinking status | stream loop | vitest | — | ✓ |
| 流式 SSE / Pull | — | pytest stream | — | hard_gates | ✓ |
| 安全模式 R0–R4 | `riskLabels.test` | pytest policy | — | — | ✓ |
| 审批 / 取消 / 缓存 | approval_cache + session semantics + panel hygiene | pytest approval | once/session/reject UI | approval e2e（含面板未崩） | ✓ |
| 主机记忆 (prefs/facts) | `test_host_memory` | — | host_memory_*；linux/k8s 分目录 | — | ✓ |
| 个人记忆 (按模式隔离) | `test_user_memory` | — | user_memory_*；linux≠k8s prefs | — | ✓ |
| 手动提炼 Skill | `test_skill_writer` | — | skill_save + reply icon | — | ✓ |
| Skills 列表 UI | `test_skills_list_api` | — | Skills 菜单；`engineer_mode` 隔离 | — | ✓ |
| Agent Status Bar | `test_status_bar` / `test_trajectory_fixtures` | — | 采样尾部注入 | — | ✓ |
| Tool artifact 预算 | `test_tool_artifacts` | — | 超长工具落盘预览 | — | ✓ |
| Memory 浏览器 UI | `test_memory_meta_api` | — | 个人/主机\|集群分区；无路径脚注 | — | ✓ |
| Skills 关键词匹配 | `test_skill_match` | — | tag/title/body | — | ✓ |
| 批准后乐观执行卡 | `approvalOptimisticExec` | — | 批准即出现 running 工具卡 | approval e2e | ✓ |
| 上下文压缩 durable | compaction + tool_pairing | pytest | — | — | ✓ |
| Skill curator 归档 | `test_skill_curator` | — | — | — | ✓ |
| terminal_exec 桥接 | Rust terminal | pytest gate | — | **✓** | ✓ |
| K8s 工具 (k8s_*) | — | pytest k8s | — | mock_ollama | ✓ |
| 交互模式 ask/plan/act | — | pytest | — | — | ✓ |
| Investigator 子代理 | — | pytest | — | — | ✓ |
| Run trace 追踪 | — | pytest trace | — | — | ✓ |
| 中途 user_context | — | API surface | — | — | ✓ |
| Session resume | — | pytest resume | — | resume | ✓ |
| 附件 (vision/office) | — | pytest | — | — | ✓ |
| 命令展示净化 | `commandDisplay.test` | pytest display | — | — | — |

## 10. AI chat 可观测性

| 功能 | 单元 | 集成 | 功能 | E2E | 用户 |
|------|:----:|:----:|:----:|:---:|:----:|
| Run trace bar UI | — | — | smoke | ✓ | ✓ |
| flushUserContext / mid-run | — | API surface | smoke | — | ✓ |

## 11. Agent Sidecar 策略与工具

| 功能 | 单元 | 集成 | 功能 | E2E | 用户 |
|------|:----:|:----:|:----:|:---:|:----:|
| PolicyEngine R0–R4 | pytest policy | — | — | — | — |
| Capabilities / deny floor | pytest | — | — | — | — |
| **Agent 硬编码禁检** | `check-no-agent-hardcoding.mjs` + pytest | smoke | — | — | — |
| web_search / web_fetch + SSRF | pytest | — | — | — | — |
| Chat images + external links (cache, openUrl, image_generate, HTML extract) | Vitest `openExternalUrl`/`chatMedia`/`turnMedia`; Rust `media_cache`; pytest `test_web_fetch_image`/`test_html_images` | smoke `ai-md-external-link` | — | — | — |
| Compaction / token meter | pytest | — | — | — | — |
| Ops plan / update_plan | pytest | — | — | — | — |
| Mock Ollama 场景 | pytest director | — | — | k8s_e2e | — |

---

## 自动化入口

```bash
# 全量（推荐每次 PR / 发版前）
./scripts/run-all-tests.sh

# Playwright UI E2E（AI chat / SSH / K8s — 无需人工）
npm run test:e2e

# 分项
npm test                          # 前端单元
npm run test:smoke                # 静态功能检查
cd agent-sidecar && pytest tests/ # Sidecar 单元+集成
cd src-tauri && cargo test        # Rust 单元
```

## CI 覆盖

`.github/workflows/ci.yml` 在 push/PR 时运行：`npm run build`、`npm test`、`test:smoke`、`cargo test`、`pytest`（Ubuntu）。

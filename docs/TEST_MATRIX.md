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
| 语言国旗 UI（zh-CN/en） | `localeFlag.test` | Playwright `app-shell` / `host-browser` | smoke `ui.locale-flags`（扁平矩形 SVG） | — | ✓ |
| 主题切换（深色/浅色） | `appTheme` | Playwright `app-shell`（data-theme） | smoke `theme-switcher` | — | ✓ |
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
| Text/Markdown/HTML/CSV 编辑 + 原生 PDF + OFV 只读（图/Office/压缩包/音视频） | `fileType.test` + `pdfjsOfv.test` + Rust preview + `previewMarkdownMode` + `markdownImagePath` | — | smoke | **✓** `preview-markdown-wysiwyg` | ✓ |
| Markdown Typora 式 WYSIWYG（Vditor IR） | `previewMarkdownMode` + `markdownImagePath` + `previewRemoteBytes` | Rust `preview_read_bytes` | smoke vditor | **✓** | ✓ |
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

## 6. 本地文件面板 (Local FS) / Host Desktop

| 功能 | 单元 | 集成 | 功能 | E2E | 用户 |
|------|:----:|:----:|:----:|:---:|:----:|
| Host Desktop 侧栏 + Dock（Markdown 式浮窗 / 最大化） | `workspacePanelSwitch` + `desktopStore` + `floatStacking` | — | smoke `ui.host-desktop` | **✓** `host-desktop` | ✓ |
| Dock → 文件管理器浮窗（含检索） | — | — | smoke | **✓** `local-fs` | ✓ |
| Dock → 进程管理器浮窗 | — | — | smoke | **✓** `local-fs-actions` | ✓ |
| Host 左树+右内容（列表/网格） | `localFsTree` + `openDirectory` | — | smoke | — | ✓ |
| Host 树新建/拖移/剪贴板/多选 | `localFsOps` + Rust `fs_path_tests` | create/copy/move | smoke menu | — | ✓ |
| 框选多选 + 路径段跳转 + 面板内传输进度；打开目录不把 cwd 加入选区（防误删整夹） | `localFsOps`（sanitize/marquee/breadcrumb） | — | smoke `hostfs.safe-select-delete` | **✓** `local-fs` breadcrumb | ✓ |
| 多选删除须确认（禁无确认批量 rm） | — | TerminalFsDialog multi | smoke | — | ✓ |
| Host 树局部重载 | `localFsStore.reloadDirectory` | — | — | — | ✓ |
| Host 树 pointer 拖移 | `localFsPointerMove` | — | smoke | — | ✓ |
| Find in files（路径栏检索 → 文件列表） | — | — | smoke | **✓** | ✓ |
| 任务管理器 (进程/kill) | `taskManagerColumns.test` | — | smoke | **✓** | ✓ |
| 发送到 AI Chat | — | — | smoke | — | ✓ |

## 6b. Host Browser (SSH SOCKS5)

| 功能 | 单元 | 集成 | 功能 | E2E | 用户 |
|------|:----:|:----:|:----:|:---:|:----:|
| Profile key / webview label | `browserProfile.test` | Rust `browser::tests` | smoke `ui.host-browser-*` / `ui.host-browser-dock` | **✓** `host-browser` | ✓ |
| SOCKS5 CONNECT → direct-tcpip | Rust `socks::tests` | curl via bridge | smoke | — | ✓（真机可选） |
| 回环 URL（`127.0.0.1` / localhost）走本地 TCP tunnel，地址栏仍显示原端口 | Rust `browser::tests` loopback retarget | — | smoke `webview_url_for` | — | ✓ |
| 多页签（按 host `sessionId` 隔离） | `browserTabs.test` | — | smoke tabs | **✓** tab new | ✓ |
| 切主机 tab 恢复工作区壳（终端/桌面/AI） | `hostWorkspaceMemory.test` + `panelVisibility` keep-mounted | — | smoke | — | ✓ |
| 切主机不泄漏上一台聊天（activeTab 门闩 + reveal 拒异会话） | `panelVisibility` + `workspacePanelSwitch` reveal | — | smoke | — | ✓ |
| 双主机 AI 切 tab 不闪（park=visibility + markdown sync seed + batched restore） | `hostWorkspaceMemory` + smoke park CSS | — | smoke `ui.host-ai-fiber-no-flash` | — | ✓ |
| 连第二台后再回第一台 AI 仍在（addConnectingTab capture + markHostAiShell） | `hostWorkspaceMemory.test` | — | smoke `ui.host-workspace-memory` | — | ✓ |
| Host Browser 跨主机隔离（session 级 webview/tunnel） | `browserProfile` session key + `browserStore` warm bucket + `hostWorkspaceMemory` | — | smoke `ui.host-browser-socks` | **✓** `host-browser` | ✓ |
| AI 跨主机 fiber（不闪） | `useAiFiberSessions` + panel `surfaceActive` + scope messages | — | smoke `ui.host-workspace-memory` | — | ✓ |
| Host Browser HTTPS CONNECT 全双工 | Rust `socks::tests` into_stream + HTTP CONNECT | — | smoke | — | ✓ |
| Host Browser 现代 Chrome UA（绕过企业「浏览器版本过低」） | Rust `host_browser_user_agent` | — | smoke `ui.host-browser-socks` | — | ✓ |
| WebKit localStorage 空洞压缩（迁库后 QuotaExceeded） | Rust `webkit_localstorage` | — | 启动时 VACUUM | — | ✓ |
| Enter 导航 / 历史图标 | — | — | — | **✓** Enter + library toggle | ✓ |
| 隔离 Webview（无 `proxy_url`） | — | — | smoke | — | ✓ |
| 历史 / 自动提示 / 书签 | `browserHistory.test` | store JSON | smoke history/bookmarks keys | **✓** toolbar + suggest | ✓ |
| 后退 / 前进 / 刷新 / URL 同步 | — | `on_page_load` emit | — | **✓** nav buttons | ✓ |
| 加载进度条（直到 PageLoad Finished） | `browserPageChrome.test` | `host-browser-load` | smoke `ui.host-browser-load-chrome` | **✓** progress | ✓ |
| 窄面板 fit-width（宽站如百度居中可见） | `computeFitWidthZoom` | Rust `FIT_WIDTH_EVAL` | smoke | — | ✓ |
| 紧凑标题栏（地球 icon + 最小/最大/关闭）+ 页签 favicon | `fallbackFaviconUrl` + `PAGE_META_EVAL` | — | smoke | **✓** favicon + icon-title | ✓ |
| Tab 切换 / 断线 shutdown | FE browserStore | — | — | mock panel open | ✓ |

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
| Agent Status Bar | `test_status_bar` / `test_trajectory_fixtures` | — | 采样尾部注入；**Prior 近期话题**；Goal 跳过 harness | — | ✓ |
| 同聊多话题（单目标收束 + 可引用 prior） | `test_prompts_continue` + `test_status_bar` Prior | CONCLUDE_NUDGE | — | — | ✓ |
| Tool artifact 预算 | `test_tool_artifacts` | — | 超长工具落盘预览 | — | ✓ |
| Memory 浏览器 UI | `test_memory_meta_api` | — | 个人/主机\|集群分区；无路径脚注 | — | ✓ |
| Skills 关键词匹配 | `test_skill_match` | — | tag/title/body | — | ✓ |
| 批准后乐观执行卡 | `approvalOptimisticExec` | — | 批准即出现 running 工具卡 | approval e2e | ✓ |
| 执行卡完成后自动折叠（用户手动展开可钉住；滚动补偿防拽跑） | `execCardExpand.test` | — | smoke | — | ✓ |
| 上下文压缩 durable | compaction + tool_pairing | pytest | — | — | ✓ |
| Skill curator 归档 | `test_skill_curator` | — | — | — | ✓ |
| terminal_exec 桥接 | Rust terminal | pytest gate | — | **✓** | ✓ |
| K8s 工具 (k8s_*) | — | pytest k8s | — | mock_ollama | ✓ |
| 交互模式 ask/plan/act | — | pytest | — | — | ✓ |
| Investigator 子代理 | — | pytest | — | — | ✓ |
| Run trace 追踪 | — | pytest trace | — | — | ✓ |
| 中途 user_context | — | API surface | — | — | ✓ |
| Session resume | — | pytest resume | — | resume | ✓ |
| SessionLog resume_miss（禁止静默薄 history；FE harness + 一次无 resume 重开） | `resumeMiss.test` + `test_session_resume` miss | chat_start 409 | smoke notice key | — | ✓ |
| SessionLog resume 跨 session_id（SSH 重连）+ FE 自动无 resume 重试 | `test_session_resume` remap | — | — | — | — |
| 附件 (vision/office) | — | pytest | — | — | ✓ |
| 命令展示净化 | `commandDisplay.test` | pytest display | — | — | — |
| AI SSH lease（禁重连） | `sshLease.test` + Rust `ai_ssh_lease_tests` | — | TerminalView 闸门 | — | ✓ |
| Long-job exec idle 豁免 | Rust `ai_exec_limits` | — | timeout≥600 关 idle | — | ✓ |
| Run stall 看门狗（冷启动 + 工具后无进度；**工具执行中 / 审批中不误杀**；FE idle abort 同） | `test_stall_watch` + `thinkingIdleAbort.test` | main stall wrap | smoke + run_stalled 清 busy | — | ✓ |
| Wall-clock run 预算 | paths `max_run_wall_seconds` | loop `_check_budgets` | — | — | ✓ |

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
| web_search / web_fetch 小卡片（关键字常显 + fetch 网页预览持久） | Vitest `webToolCard` / `formatToolResultDisplay` | smoke `ai-web-tool-card` | — | — | — |
| web_search 臆造年份（用户未写的 YYYY）→ strip + advice，不塞年份 | pytest `test_web_query_calendar` | — | hardcoding ban | — | — |
| Chat images + external links (cache, openUrl, image_generate, HTML extract) | Vitest `openExternalUrl`/`chatMedia`/`turnMedia`; Rust `media_cache`; pytest `test_web_fetch_image`/`test_html_images` | smoke `ai-md-external-link` | — | — | — |
| Compaction / token meter | pytest | — | — | — | — |
| Probe streak → force conclude（连续探查工具后强制收束） | `test_probe_streak` + `test_stream_loop` | — | smoke | — | — |
| 相同命令死循环硬拦（RepeatTool hard-deny；**失败后再交同一命令** fail-deny@2；FORCE 下不从 content 恢复 tool JSON；probe conclude 不 unlock lead-in） | `test_repeat_tool` + `test_stream_loop` | — | smoke `agent.repeat-tool-hard-deny` | — | — |
| Content echo loop → abort stream（复读环掐流） | `test_content_loop_abort` + `test_stream_loop` | — | — | — | — |
| Shell script dump → act（粘贴 find/lsof 不当 truncated 续写） | `test_thinking_sanitize` + `test_stream_loop` | — | smoke | — | — |
| 括号截断续写（路径+容量 `(12G)` 不当作句号） | `test_thinking_sanitize` ends_without… | — | smoke | — | — |
| 截断续写越界（补句号后甩第二套总结 / 假应答 → 截断丢弃） | `test_thinking_sanitize` overshoot | loop trim | — | — | ✓ |
| 聊天滚动（长表格流式：table-layout fixed；半截 table 行补齐；触控板微 wheel 不弃贴底；settle 8s；streaming assistant 强制 follow） | `chatScroll.test` + `stabilizeStreamingMarkdown.test` + Playwright `ai-chat-scroll-maximize` | — | smoke `ai.chat-scroll-final` | ✓ | — |
| 切换模型不甩滚动（async saveSettings 期间延长 chrome lock；resize RO 让路） | `chatScroll.test` + Playwright selecting model | — | smoke | ✓ | — |
| 流式出字不卡顿（delta/tool 输出 rAF 合并；流式不写磁盘；落盘在 message/tool/结束） | `streamDeltaCoalesce.test` | — | smoke | — | — |
| 只读探测 filter 无匹配（exit 1 + 空 stderr + 有 stdout → soft-ok，不标失败、不瞎重试） | `readProbeOutcome.test` + `test_read_probe_outcome` | — | smoke | — | — |
| 切换模型不卡顿（saveSettings 后台热更新 sidecar env，不在 UI 线程同步 restart） | `test_runtime_config` + Rust `apply_settings_to_sidecar` | — | smoke | — | — |
| Composer 输入隔离（keystroke 不重渲整面板 transcript） | `composerInputIsolation.test` | — | smoke `ai.composer-input-island` | ✓ | — |
| AI 中途截断续写（自动续写；无增长/回声复述即停；清单/状态 emoji 结尾视为写完；**不**向用户展示「回复未写完／继续」） | `truncatedAssistant.test` + `reconcileAssistantFromTranscript.test` + `test_stream_loop` + `test_thinking_sanitize` | — | smoke `ai.incomplete-reply` | ✓ | — |
| Markdown 稳定化（成对 `**`→`<strong>`；`<tool_call>` XML 改写成代码块避免浏览器吞标签；tagged fence 不拆；空 fence / bare fence / 半截 table） | `stabilizeStreamingMarkdown.test` | — | smoke | — | — |
| 执行卡输出只展示 stdout/stderr（不把 `_note`/`_untrusted` JSON 信封甩给用户） | `formatToolResultDisplay.test` | — | smoke | — | — |
| Tool JSON/XML as content → recover tool_calls（`` `json` `` 与 `<tool_call><function=…>`；闭合 fence 不误判截断） | `test_thinking_sanitize` + `test_stream_loop` + `truncatedAssistant.test` | — | smoke | — | — |
| 批准卡 = 执行卡同壳（标题栏 + `$` 命令 + 底栏拒绝/会话/批准；批准后隐藏批准卡） | `approvalCommandDedupe.test` + e2e `ai-engineer-approval` | — | smoke `ai.approval.command-exec-chrome` | ✓ | — |
| Auto-continue until finished（禁止用「请回复继续」躲避未写完） | `test_stream_loop` | — | smoke | — | — |
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

# Changelog

## [0.0.4] - 2026-09-30

A connected Linux host becomes a desktop.

- Click the host icon and the workspace beside the sidebar is that machine’s desktop; click again to return to the terminal
- Dock apps: Files, Processes, Browser (host network, including 127.0.0.1), Terminal, and AI Linux — the last two reuse the existing session
- Windows drag, resize, and stack. Leaving the desktop remembers which windows were open and where they sat

已连接的 Linux 主机变成桌面。

- 点主机图标，侧栏右边就是这台机器的桌面；再点一次回到终端
- Dock：文件、进程、浏览器（主机网络，含 127.0.0.1）、终端、AI Linux；后两个复用现有会话
- 窗口可拖动、缩放、叠放。离开桌面会记住打开的窗口和位置

## [0.0.3] - 2026-09-29

Same chat stays continuous when switching models and agents.

- One AI Engineer thread can move between built-in models and Cursor, Codex, or Claude Code without starting a blank task
- An external CLI resumes its own session while that session is still the latest work on the thread
- After a switch, or when the vendor session is missing or rejected, the next turn is rebuilt from the SessionLog, including tool output
- Codex exec sessions are resumable (no ephemeral session)

同一条对话里切换模型和 Agent 后，工作连续。

- 一条 AI 工程师对话可在内置大模型与 Cursor、Codex、Claude Code 之间切换，不会变成一场空任务
- 外部 CLI 在自己的会话仍是这条聊天的最新工作时，沿用该会话
- 中途切换后，或原厂会话丢失、被拒绝时，下一句按 SessionLog 重建，包含工具输出
- Codex exec 会话可续接（不再使用一次性会话）

## [0.0.2] - 2026-09-26

Cursor / Codex / Claude Code as ops agent runtimes.

- Agent runtimes: Cursor Agent, Codex, Claude Code via TW MCP on the live SSH session / selected cluster
- Unified approval plane with agent-source labels; STOP kills external CLI runs
- Guided install/login readiness; automatic MCP / workspace wiring (no silent CLI install)
- Dual-plane chat UX (local CLI activity + remote exec cards)
- Built-in AI Linux / K8S Engineers unchanged alongside external runtimes
- macOS: embed About-menu and window icons so a machine without the build tree does not abort on launch
- Rebuild: host-native bundled Python only; model settings stay profiles; Ungrouped hosts start expanded and a new host can pick a group; a Base URL in the API key field is rejected
- Agent CLI probe sees Homebrew, `/usr/local/bin`, and the login-shell PATH; Codex bundled in current ChatGPT is detected
- A missing CLI cannot be selected as the answering agent; the download icon opens the install page (Codex → ChatGPT desktop download)

将 Cursor / Codex / Claude Code 接入运维 Agent 运行时。

- 经 TW MCP 在已连接 SSH / 所选集群上运行 Cursor Agent、Codex、Claude Code
- 统一审批面（标注 Agent 来源）；STOP 可终止外部 CLI
- 安装/登录引导；自动接线 MCP / 工作区（不静默安装 CLI）
- 双平面对话 UX（本机 CLI 活动 + 远端执行卡片）
- 内置 AI Linux / K8S Engineer 与外部运行时并存
- macOS：About 菜单与窗口图标编译进二进制，避免未带源码目录的机器启动即退出
- 重新打包：内置 Python 只选本机系统可执行文件；模型设置不再包含 Agent CLI；未分组默认展开且新建主机可选分组；API Key 填成网址时会拦住
- Agent CLI 检测覆盖 Homebrew、`/usr/local/bin` 与登录 shell PATH；认出新版 ChatGPT 内置 Codex
- 未检测到的 CLI 不能选作回答 Agent；下载图标打开安装页（Codex 指向 ChatGPT 桌面版下载）

## [0.0.1] - 2026-09-20

Public release (republished).

- SSH terminal with multi-tab sessions, bookmarks, and SFTP / Host file workspace
- Host Desktop: Files, Processes, Browser dock apps on the connected SSH host (per-host layout)
- Host Browser: remote HTTP via live SSH (incl. `127.0.0.1`), multi-tab, history, bookmarks
- Host files: Finder-style tree + contents (list/grid), back/up navigation, path bar follows focus, multi-select move with sudo retry, native PDF preview
- Markdown Typora-like WYSIWYG (Vditor IR) in the preview panel
- Dark / light theme switcher in the title bar
- Kubernetes workbench (Hosts ↔ K8s): kubeconfig / SSH kubectl, YAML, logs, Pod shell
- AI Linux Engineer & AI K8S Engineer with policy-graded approvals; long runs keep the SSH lease
- Mode-isolated personal / host / cluster memory and user skills
- OpenAI-compatible / Ollama / Anthropic-compatible / Gemini model profiles
- Windows, macOS, and Linux installers (x86_64 and ARM64)

公开发布（重新打包）。

- 多标签 SSH、书签、SFTP / 主机文件工作区
- 主机 Desktop：已连接主机上的 Files / Processes / Browser
- 主机 Browser：经 SSH 访问远端 HTTP（含 `127.0.0.1`），多标签 / 历史 / 书签
- 主机文件：左树右内容（列表/网格）、后退/上一级、路径栏跟随、多选拖拽（sudo 重试）、原生 PDF 预览
- Markdown 类 Typora 所见即所得（Vditor IR）
- 标题栏深色 / 浅色主题切换
- Kubernetes 工作台（主机 ↔ K8s）：kubeconfig / SSH kubectl、YAML、日志、Pod Shell
- AI Linux / K8S Engineer + 策略审批；长任务续租 SSH
- 按模式隔离的个人 / 主机 / 集群记忆与 Skills
- OpenAI 兼容 / Ollama / Anthropic 兼容 / Gemini
- Windows / macOS / Linux 安装包（x86_64 与 ARM64）

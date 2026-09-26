# Changelog

## [0.0.2] - 2026-09-26

Cursor / Codex / Claude Code as ops agent runtimes.

- Agent runtimes: Cursor Agent, Codex, Claude Code via TW MCP on the live SSH session / selected cluster
- Unified approval plane with agent-source labels; STOP kills external CLI runs
- Guided install/login readiness; automatic MCP / workspace wiring (no silent CLI install)
- Dual-plane chat UX (local CLI activity + remote exec cards)
- Built-in AI Linux / K8S Engineers unchanged alongside external runtimes

将 Cursor / Codex / Claude Code 接入运维 Agent 运行时。

- 经 TW MCP 在已连接 SSH / 所选集群上运行 Cursor Agent、Codex、Claude Code
- 统一审批面（标注 Agent 来源）；STOP 可终止外部 CLI
- 安装/登录引导；自动接线 MCP / 工作区（不静默安装 CLI）
- 双平面对话 UX（本机 CLI 活动 + 远端执行卡片）
- 内置 AI Linux / K8S Engineer 与外部运行时并存

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

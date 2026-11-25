# Changelog

## [0.1.4] - 2026-11-25

Expand EditorWisely into a local and remote file workspace, and open operating-system file requests directly in the matching editor.

- Add a lazy-loaded directory tree to EditorWisely and keep multiple files open in tabs
- Route OS-opened local text files to EditorWisely in a full-window workspace
- Route OS-opened Markdown files directly to the requested document in MarkWisely
- Preserve the Home workspace while activating the appropriate Desktop app for an incoming file

扩展 EditorWisely 的本机和远程文件工作区，并让操作系统的文件打开请求直接进入对应编辑器。

- EditorWisely 新增按需加载的目录树，支持通过多个标签同时打开文件
- 操作系统打开的本机文本文件直接进入铺满窗口的 EditorWisely 工作区
- 操作系统打开的 Markdown 文件直接显示在 MarkWisely 对应文档中
- 收到文件打开请求时保留 Home 工作区，并激活对应 Desktop 应用

## [0.1.3] - 2026-11-24

Restore the Home host directory with Local pinned first and saved SSH hosts shown in their current groups.

- Open Local Desktop in its own titlebar tab without creating an SSH session
- Open a saved SSH host through the existing credential and session flow, then show its Desktop in the new session tab
- Keep Home Terminal and local chat available from the directory; remove Home-only AI/Desktop titlebar shortcuts
- Preserve the existing Hosts sidebar group layout and target-specific Desktop state
- Open Markdown documents from local and SSH Files in an integrated MarkWisely workspace with titlebar document tabs, a Markdown file tree, and a document outline
- Use available window space for Markdown content and its formatting toolbar; close the workspace from its window control without treating that action as a tab close
- Simplify MarkWisely file navigation and search controls

恢复 Home 主机目录，Local 固定置顶，已保存 SSH 主机沿用当前分组显示。

- 点击 Local 可在独立标题栏标签打开本机 Desktop，不创建 SSH 会话
- 点击已保存 SSH 主机沿用原凭据和会话流程，并在新会话标签中显示 Desktop
- Home 目录保留本机 Terminal 和聊天入口；移除 Home 目录专用的 AI/Desktop 标题栏快捷按钮
- 保留 Hosts 侧栏分组布局和按目标隔离的 Desktop 状态
- 从本机和 SSH Files 打开的 Markdown 使用集成的 MarkWisely 工作区，提供标题栏文档标签、Markdown 文件树和文档大纲
- Markdown 正文与格式工具栏按窗口可用空间布局；窗口关闭按钮关闭整个工作区，不会误关为关闭文档标签
- 简化 MarkWisely 文件导航与搜索控件

## [0.1.2] - 2026-11-18

Focus TerminalWisely on local Home and remote SSH Hosts workspaces, with Terminal and Desktop tools.

- Add EditorWisely, a CodeMirror 6 editor for local and SSH-host text/source files, with syntax highlighting, multi-document tabs, find/replace, autosave, unsaved-change protection, and UTF-8/BOM plus LF/CRLF preservation
- Open text files in EditorWisely from the Home or Host file manager, using the existing local filesystem or SSH session
- Sort file lists by name, size, and modified time; keep Desktop app icons fully visible in a separate column
- Remove retired Kubernetes and Database workspaces and their dedicated commands, tools, and UI; clean up app-owned legacy data while preserving SSH/AI credentials and external user configuration
- Preserve Home and Hosts Terminal/Desktop workflows and the existing MarkWisely Markdown workspace

TerminalWisely 聚焦本机 Home 与远程 SSH Hosts 工作区，提供 Terminal 和 Desktop 工具。

- 新增 EditorWisely：基于 CodeMirror 6 的本机与 SSH 文本/源码编辑器，支持语法高亮、多文档标签、查找替换、自动保存、未保存保护，并保留 UTF-8/BOM 与 LF/CRLF 格式
- 可从 Home 或主机文件管理器打开文本文件，沿用现有本机文件系统或 SSH 会话
- 文件列表支持按名称、大小和修改时间排序；桌面应用图标完整显示在独立列中
- 移除已退役工作区及其专属命令、工具和界面；清理应用自有遗留数据，同时保留 SSH/AI 凭据和用户配置
- 保留 Home 与 Hosts 的 Terminal/Desktop 工作流，以及 MarkWisely Markdown 工作台

## [0.1.1] - 2026-11-10

Expand MarkWisely into a full local and remote Markdown workspace.

- Add multi-document editing, outline navigation, workspace browsing and search, recovery drafts, themes, and source/compatibility editing
- Import supported formats into new documents and export styled HTML, PDF, and Word files; expose additional formats when Pandoc is installed
- Associate `.md` and `.markdown` files with TerminalWisely and open them in the local MarkWisely workspace
- Let maximized Desktop apps cover the full TerminalWisely workspace and preserve readable Markdown layout through repeated resizing
- Support PostgreSQL text filters for non-text database values

将 MarkWisely 扩展为完整的本机与远程 Markdown 工作台。

- 增加多文档编辑、大纲导航、工作区浏览与搜索、恢复草稿、主题以及源码/兼容语法编辑
- 将支持的格式导入为新文档并导出带样式的 HTML、PDF 和 Word；安装 Pandoc 后可使用更多格式
- 将 `.md` 和 `.markdown` 文件关联到 TerminalWisely，并在本机 MarkWisely 工作区打开
- Desktop 应用最大化时覆盖整个 TerminalWisely 工作区，反复缩放时 Markdown 排版保持可读
- 支持 PostgreSQL 非文本数据库值的文本筛选

## [0.1.0] - 2026-10-30

Add a local Desktop workspace to Home, sharing the existing Home PTY and isolating Local state from each SSH host.

- Add Terminal, AI Local, and MarkWisely to Home Desktop; local files, browser, and process management remain native computer apps, and AI Linux stays SSH-only
- Reuse and restore the selected Home Terminal and existing Home chat when switching into and out of Desktop
- Keep Local and SSH Desktop state isolated
- Bundle Microsoft Coreutils for Windows v2026.9.3 x64/ARM64; only the app's PowerShell child process gets its command path and alias changes
- Keep PowerShell profiles, system PATH, and registry unchanged

Home 增加本机 Desktop，复用 Home PTY，并将 Local 状态与各 SSH 主机隔离。

- Home Desktop 提供 Terminal、AI Local 和 MarkWisely；本机文件、浏览器与进程管理使用电脑自带的应用，AI Linux 仍仅用于 SSH
- 切换 Desktop 时复用并恢复当前 Home Terminal 和现有 Home 聊天
- 本机与 SSH Desktop 状态相互隔离
- Windows x64/ARM64 内置微软 Coreutils for Windows v2026.9.3；命令路径和别名更改仅限应用启动的 PowerShell 子进程
- 不修改 PowerShell Profile、系统 PATH 或注册表

## [0.0.9] - 2026-10-25

Refine the Desktop workspace, remote file manager, MarkWisely, and update experience.

- Maximized Desktop apps cover the Dock; moving the pointer to the bottom edge reveals it
- Show Linux metadata in file list view and filenames only in icon view; remove the redundant terminal-directory locator
- Keep remote file operations in Desktop and add the MarkWisely remote Markdown app with file/folder pickers
- Render update release notes as Markdown and make Chat/Desktop switching reliable in one click
- Show the connected machine name in the Desktop toolbar

改进 Desktop 工作区、远程文件管理器、MarkWisely 和升级体验。

- Desktop 应用最大化时覆盖 Dock；鼠标移至屏幕底边后 Dock 再显示
- 文件列表显示 Linux 属性，图标视图只显示文件名；移除多余的终端目录定位按钮
- 远程文件操作集中在 Desktop，并加入支持文件/文件夹选择的 MarkWisely Markdown 应用
- 升级说明按 Markdown 渲染，聊天与 Desktop 可单击切换
- Desktop 工具栏显示当前连接的机器名

## [0.0.8] - 2026-10-23

Unified the desktop UI and interaction feedback across workspaces, with Home and language-control refinements.

- Align light/dark visual rules and focus, selection, loading, error, and approval feedback across workspaces
- Start Home with the local Terminal visible and chat collapsed; keep the split adjustable when chat is open
- Keep Home, Hosts, Kubernetes, and Databases tabs isolated while switching spaces
- Replace flag icons with compact Chinese/English labels and keep the title-bar control position stable
- Validate UI and builds across macOS, Windows, and Linux CI runners

统一各工作区的桌面界面与交互反馈，并优化 Home 和语言入口。

- 统一明暗主题，以及焦点、选中、加载、错误和审批状态的反馈
- Home 默认显示本机 Terminal 并收起聊天；展开聊天后仍可调整分栏
- 切换空间时隔离 Home、Hosts、Kubernetes 和 Databases 的页签
- 用简洁的中英文文字替代旗帜图标，切换语言时标题栏控件位置保持稳定
- 通过 macOS、Windows 和 Linux CI runner 验证界面与构建

## [0.0.7] - 2026-10-23

Home is now a local operations space with an interactive Terminal beside local chat.

- Home opens directly to the local Terminal and chat; Windows uses PowerShell
- Add independent local Terminal tabs; keep the first tab fixed
- Hide the Hosts list in Home, fill the left workspace with Terminal, and resize the Terminal/chat split
- Open Home from space navigation without a duplicate Home tab or bottom host status strip
- Keep existing Hosts, Kubernetes, and Databases workflows

Home 现在是本机运维空间：交互式 Terminal 与本机聊天并排显示。

- 打开 Home 后直接进入本机 Terminal 和聊天；Windows 使用 PowerShell
- 可新增独立的本机 Terminal 页签，第一个页签固定保留
- Home 隐藏 Hosts 列表，Terminal 占满左侧工作区，Terminal 与聊天的分隔栏可调整
- 从空间导航进入 Home，不再重复显示 Home 页签或底部主机状态条
- 保留 Hosts、Kubernetes 和 Databases 的现有工作流

## [0.0.6] - 2026-10-11

Hosts, Kubernetes, and Databases share one set of chrome. No new features.

- A selected row is one accent border. Tree selection keeps the foreground color
- List inset, row padding, group labels, icon buttons, search fields, and secondary tabs use the same sizes
- An empty Kubernetes workspace shows the existing hint. An empty database result uses the same empty style
- Tests cover tab menus, the settings version, locale and theme across the three sidebars, and sidebar width after reload
- The title-bar plus adds a server, a cluster, or a database connection for the sidebar that is open
- The first letter in an empty field is not auto-capitalized
- Add cluster uses the same dialog footer as the other dialogs
- On Windows, agent sign-in opens the system browser, and a slow probe does not mark an installed CLI as missing

主机、Kubernetes、数据库共用一套界面。没有新功能。

- 选中行是一条强调色边。树里的选中保持前景色
- 列表留白、行内边距、分组标题、图标按钮、搜索框和次级页签用同一套尺寸
- 没有集群时显示已有提示。数据库空结果用同一套空状态
- 测试补上页签菜单、设置里的版本号、三条侧栏的语言和主题，以及刷新后的侧栏宽度
- 标题栏加号按当前侧栏添加服务器、集群或数据库连接
- 空输入框的第一个字母不会被自动改成大写
- 添加集群和其它对话框共用同一套底栏
- Windows 上 Agent 登录会打开系统浏览器；探测变慢时，已安装的 CLI 不再显示成未安装

## [0.0.5] - 2026-10-10

Hosts, Kubernetes, and databases are three sidebars. AI follows the open object.

- Database workbench: one service, one tab, one chat. Table tabs show database and schema
- A restore icon appears after you run SQL that is not the table’s default browse. Editing the statement does not change the grid
- Database connections start under Ungrouped. Host groups are not copied there
- Home is the welcome page and does not show a chat

主机、Kubernetes、数据库是三个侧栏。AI 跟到打开的对象。

- 数据库工作台：一个服务一个页签、一份聊天。表页签标出库和 schema
- 执行的不是表的默认浏览时，出现恢复图标。只改语句、不点执行，表格不动
- 数据库连接先放在未分组。主机的分组不会抄过来
- Home 是欢迎页，不显示聊天

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

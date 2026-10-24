# Changelog

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

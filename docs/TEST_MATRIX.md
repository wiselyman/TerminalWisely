# TerminalWisely 功能与测试矩阵

> **开发新功能时（Agent / 贡献者必读）**
> 1. 为新功能添加对应层级测试（见 `AGENTS.md`）
> 2. 运行 **`./scripts/run-all-tests.sh`** 且全部 PASS 后再提交
> 3. 更新本矩阵中相关功能行

## 测试层级说明

| 层级 | 命令 | 说明 |
|------|------|------|
| **单元测试** | `npm test` / `cargo test` / `pytest tests/` | 纯函数、策略、模型，无真实 SSH |
| **集成测试** | `pytest tests/test_api_surface_integration.py` 等 | Sidecar HTTP API、AgentLoop + mock 模型 |
| **静态功能检查** | `node scripts/smoke-product-checklist.mjs` | 前端 wiring、i18n、关键文件存在性 |
| **端到端 (E2E)** | `pytest tests/test_e2e_hard_gates.py` 等 | Pull 协议 + fake 模型完整对话 |
| **SSH 实时连接 / SFTP 上传** | `bash scripts/e2e-ssh-integration.sh` | Docker openssh + Rust `live_integration`（密码/密钥/下载/取消/重连） |
| **拖拽上传 UI** | `npm run test:e2e` → `e2e/ssh-drag-upload.spec.ts` | Playwright HTML5 drop + mock `upload_files` |
| **用户测试 / UI E2E** | `npm run test:e2e` (Playwright) | AI chat、SSH、Tab、审批、LocalFS、Desktop、设置 |

## 跨平台 / 跨架构 CI 矩阵

| Runner | OS | CPU | 测试内容 |
|--------|-----|-----|----------|
| `linux-x86_64` | Ubuntu 22.04 | x86_64 | smoke + Vitest + build + `cargo test` + SSH live + pytest + Playwright |
| `linux-aarch64` | Ubuntu 24.04 ARM | aarch64 | 同上（含 SSH live） |
| `macos-aarch64` | macOS latest | Apple Silicon | smoke + Vitest + build + `cargo test` + `cargo check` x86_64 + pytest |
| `windows-x86_64` | Windows latest | x86_64 | smoke + Vitest + build + `cargo check` + `cargo check` ARM64 + pytest + Playwright UI E2E (PowerShell harness) |

> Linux 上不做 GTK/Tauri 的跨 GNU 架构编译（需 sysroot）；由 **linux-x86_64** 与 **linux-aarch64** 两个原生 runner 覆盖。  
> macOS Intel / Windows ARM64 安装包由 **Release** workflow 在对应 triple 上构建；CI 在 macOS 上交叉 `cargo check` Intel，在 Windows 上交叉 `cargo check` ARM64。

本地：`bash scripts/cross-arch-rust-check.sh`（Linux 上自动 skip；macOS/Windows 上检查另一架构 triple）。

---

## 1. 应用壳层

| 功能 | 单元 | 集成 | 功能 | E2E | 用户 |
|------|:----:|:----:|:----:|:---:|:----:|
| 当前 UI 暗亮基线（Home / Hosts / AI 聊天与审批 / 文件 / 桌面 / 设置） | — | — | smoke | Playwright `ui-visual-baselines`（固定视口截图；Home 窄屏与键盘焦点） | ✓ |
| Home 目录与 Local/SSH Desktop 工作区标签隔离（无 Hosts 左侧列表、无独立 Terminal 标签） | `homeDesktopTabs` | — | smoke | Playwright `app-shell` / `home-host-directory` / `home-local-terminal-chat` | ✓ |
| 自定义标题栏 / 窗口控制 | — | — | smoke | — | ✓ |
| Home / Hosts 空间切换 | — | — | smoke | — | ✓ |
| Home 主机目录（固定 Home 标题栏标签；Local 置顶、SSH 沿用分组排序；卡片打开 Local/SSH Desktop 标签；隐藏页面标题、目录入口按钮和侧栏 scope 图标） | `HomeHostDirectory.test` + `managedEntityStore.test` | SSH 卡片沿用 `connectSaved` 与凭据提示 | smoke `ui.home-host-directory` | **✓** `home-host-directory` Local/SSH Desktop 打开与切换；`app-shell` Home 返回目录 | 0.1.3 |
| 多 Tab SSH 会话 | Rust shell | — | smoke | — | ✓ |
| Home 欢迎页 | — | — | smoke | — | ✓ |
| i18n 中英文 | — | — | smoke | ✓ | ✓ |
| 语言切换 | — | Playwright `app-shell`/`settings-i18n`（menu portal + html lang） | smoke `locale-switcher` | — | ✓ |
| 语言入口文字标记（zh-CN/en） | — | Playwright `app-shell` / `settings-i18n`（语言标记与菜单无旗帜 SVG、切换时入口宽度与邻近图标位置稳定、Home 收起态保持） | smoke `ui.locale-labels`（中 / EN） | — | ✓ |
| 主题切换（深色/浅色） | `appTheme` | Playwright `app-shell`（data-theme） | smoke `theme-switcher` | — | ✓ |
| 应用设置 / 更新检查 | Rust updater | — | smoke | — | ✓ |
| Toast / 状态栏传输进度 | `transferFormat.test` | — | smoke | — | ✓ |
| Legacy workspace data cleanup (只删应用自有的退役工作区记录；保留 SSH/AI 密钥和用户配置；失败下次重试) | Rust `durable::tests::feature_cleanup` / `startup_feature_cleanup` | startup cleanup is best-effort | smoke Home/Hosts-only | — | ✓ |
| 功能五段（计划闸门） | — | — | smoke `process.feature-flow` | — | 计划缺旧行为、架构或设计时不改产品代码；不走 Codex 联合审查 |

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
| Markdown Typora 式 WYSIWYG（Vditor IR；KaTeX 与 Mermaid 本地资源离线渲染） | `previewMarkdownMode` + `markdownImagePath` + `previewRemoteBytes` + `markdownSourceRoundTrip` | Rust `preview_read_bytes` | smoke Vditor/本地渲染语言 | **✓** `home-local-terminal-chat` 禁用外网后验证公式与 Mermaid SVG | ✓ |
| MarkWisely 本机/SSH 图片插入与多文档标签（文件名保留 Unicode、URL 编码与目标目录冲突避让；每个 target 可同时编辑多文档，标签独立保存/关闭；标题栏有页签时隐藏重复中央文件名） | `markdownImagePath.test` + `previewRemoteBytes.test` + `markWiselyStore.test` | 本机 `write_local_bytes`；Hosts `list_remote_directory` + `preview_write_bytes` | smoke Markdown editor | **✓** Home 本机图片上传；Hosts 多文档打开/切换、标题栏无重复文件名及原有编辑保存 | ✓ |
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
| Host Desktop 铺满工作区 + Dock（图标标题栏、Terminal / AI Linux 复用会话；标题栏 AI 退出桌面打开右侧聊天；新建主机弹层高于桌面；任一内部 App 最大化时覆盖完整 TerminalWisely 内容区并隐藏外部导航/状态栏，还原后恢复；短窗口下 Dock 上方图标换列，EditorWisely 完整可见） | `workspacePanelSwitch` + `desktopStore` + `desktopSurfaceHost` | — | smoke `ui.host-desktop` | **✓** `host-desktop`：MarkWisely、Files、Processes 全窗口边界及还原、短窗口 EditorWisely 图标边界回归 | ✓ |
| Dock → 文件管理器浮窗（含检索） | — | — | smoke | **✓** `local-fs` | ✓ |
| 文件列表 Name/Size/Modified 表头可键盘聚焦、点击升降序排序；目录优先、元数据缺失项置后、并列值稳定；切目录回默认顺序 | `localFsSort.test` | — | — | **✓** `local-fs` Name/Size/Modified 排序顺序与 ARIA 状态 | ✓ |
| Dock → MarkWisely（远程 Markdown 新建/打开/编辑/自动保存/最近文件；图标化文件夹选择操作和工具栏悬浮说明；HTML/PDF/Word 高质量直接导出到本机并强制匹配实际文件扩展名；最大化恢复布局） | `markWiselyStore.test`, `markWiselyExport.test`, `markWiselyExportPath.test`, `markWiselyPdf.test`, `localFsApi.test` | SSH `preview_open` / `preview_save` / `create_path`; 本机 HTML/PDF/DOCX 文件写入 | `host-desktop` 文件夹图标与 hover 标签、工具栏悬浮标签、导出菜单、本机保存框、错误扩展名校正、PDF 可解析与文本提取 | **✓** `host-desktop` | ✓ |
| EditorWisely（CodeMirror 6 文本编辑、本机/SSH 多文档标签、JS/TS/JSX、Python、JSON、Markdown、HTML/CSS/Sass、YAML/XML、Rust、SQL、C/C++、Java、Go、PHP、Shell、TOML、Kotlin、Swift、Ruby、properties、Dockerfile、Makefile 语法高亮、UTF-8 BOM 与 LF/CRLF 保留、查找替换、800ms 空闲自动保存、异步读取呈现与迟到读取保护、未保存保护、失败内容保留、最近文件目录） | `editorWiselyText.test` + `editorWiselyLanguages.test` + `editorWiselyRecents.test` + `editorWiselyStore.test` + `desktopStore.test` | 本机 `read_local_bytes` / `write_local_bytes`；Hosts 当前 SSH 会话 `preview_read_bytes` / `preview_write_bytes` | smoke `ui.editorwisely`；Home/Hosts 打开与保存、异步读取/关闭重开内容呈现、自动保存和失败保留、标签/关闭保护；Shell/Go/JS 高亮；关闭文件后重新打开选择器回到文件目录；MarkWisely 原有路径回归 | **✓** | 0.1.2 |
| MarkWisely 多文档标签、独立脏状态/恢复草稿、本机与 SSH 图片相对路径、系统 `.md`/`.markdown` 文件关联及队列投递 | `markWiselyStore.test`, `markWiselyRecovery.test`, `markdownOpenQueue.test`, `markdownImagePath.test`, `previewRemoteBytes.test`, Rust `markdown_open::tests` | 本机 read/write + SSH `preview_open`/`preview_save`/`preview_read_bytes`/`preview_write_bytes` | smoke `markwisely.os-file-open`；`home-local-terminal-chat` 本机图片、恢复/丢弃/失败保存关闭保护/重试、源码兼容；`host-desktop` 多文档 | **✓** 定向 Playwright 图片/恢复/丢弃/失败保存/多文档/源码兼容 | OS 原生关联尚需打包真机验证 |
| MarkWisely Typora 对齐写作画布（混合语法默认 WYSIWYG；YAML/HTML/未知围栏/引用局部兼容节点与定点源码编辑；显式源码视图；左侧文件树、右上角图标按需切换 Outline；标题栏图标顺序 Hide sidebar/Source/下拉；无 Editor preferences 菜单项；Import 转成并打开新 Markdown 文档、不改动当前文档；统计固定显示在右下角且与瞬时保存状态错开；剪贴板图片写入同级 `images/`；居中限宽、紧凑操作、快捷打开/保存；隐藏格式工具栏、右键完整格式菜单含表格/链接/任务列表/标题层级/撤销重做、标题栏窄窗不重叠与统一画布底色；正文宽度不再被 Vditor 默认内边距压窄；长中文列表在宽画布最多两行；多文档页签并入窗口标题栏同一水平行且最大化后仍可见；编辑器连续缩放后宽度跟随宿主且不受陈旧内联宽度影响；下拉菜单可见并命中菜单操作；旧偏好迁移） | `markdownSourceRoundTrip.test`, `preferences.test`, `markdownStatistics.test`, `markdownImagePath.test`, `previewRemoteBytes.test` | Home 本机文本与 `images/` 文件读写；Hosts 当前 SSH 会话 Markdown 与 `images/` 文件读写；Pandoc 输出通过本机或远程目标新建/保存，不改动来源文档；旧兼容片段逐字还原 | smoke 验证 Vditor 包内资源和构建复制插件（无需预先生成 `public/vditor`）+ Home 混合兼容节点/编辑/取消/应用/视图切换、标题控件排序/右下统计/图片剪贴板/新文档导入/工具栏隐藏/右键格式 E2E；Hosts 右上 Outline/侧栏/视图模式/远程图片剪贴板/保存、右键加粗/表格、正文宽度、窄窗标题栏 E2E | Home + Hosts 定向 Playwright；标题栏同一行页签、窄窗无重叠、连续缩放和陈旧宽度恢复、下拉菜单可视与点击回归；light/dark 视觉基线；单元往返、路径和偏好迁移 | Windows/Linux 外观与大文档性能待验证 |
| Typora 对照固定样例、成对报告与中位数/macOS 10% 门槛 | `markdownBenchmark.test` | `capture.mjs`, deterministic `fixtures/`, `analyze.mjs` | smoke `markwisely.performance-report` | capture/hash/sample-pair tests; existing analyzer threshold tests | M3 MacBook Air metadata captured; Typora not installed, so paired app timings remain unmeasured |
| MarkWisely 本机/SSH 文件浏览、大纲过滤/跳转、快速模糊打开、显式全文搜索（隐藏项默认跳过、进度、取消、目标根隔离） | `markWiselyWorkspace.test`, `markWiselyOutline.test`（含 500 条结果） | local directory/text APIs；SSH current-session `list_remote_directory` + `preview_open`/`preview_close` | smoke `markwisely.workspace-search` | **✓** Home 大纲/搜索/取消与 Host 浏览/搜索/切主机；终端 Markdown 快速预览回归 | macOS/Windows/Linux 原生文件系统回归待跑 |
| MarkWisely 偏好、折叠侧栏迁移、内置主题、专注/打字机模式、拼写检查与安全自定义 CSS | `preferences.test`, `markWiselyPreferencesStore.test` | versioned localStorage + editor-scoped style registry + contenteditable spellcheck | smoke `markwisely.editor-preferences` | **✓** Home 主题隔离/键盘切换/模式持久化/光标居中/侧栏偏好迁移/自定义 CSS 范围/拼写检查开关 | **✓** macOS light/dark visual baselines |
| MarkWisely 内置格式导出与可选 Pandoc 适配器 | `markdownImportExport/adapters.test`, `tauriExecutor.test`, existing export/PDF/path tests, Rust `markdown_conversion::tests` | HTML/PDF/DOCX/Markdown adapters + bounded/cancellable argument-array Pandoc import/export | smoke `markwisely.import-export-adapters` | **✓** Home DOCX import to a new Markdown document + Hosts HTML/PDF/DOCX export E2E; adapter failure/round-trip/cancel contracts; real local Pandoc DOCX import/HTML export | **✓** local macOS Pandoc 3.8.2 integration; CI without Pandoc skips the conditional live test |
| Dock → 进程管理器浮窗 | — | — | smoke | **✓** `local-fs-actions` | ✓ |
| Host 左树+右内容（列表/网格）；内容区文件夹单击选中、双击进入 | `localFsTree` + `openDirectory` + `resolveContentsPrimaryClickAction` | — | smoke | — | ✓ |
| Host 树新建/拖移/剪贴板/多选 | `localFsOps` + Rust `fs_path_tests` | create/copy/move | smoke menu | — | ✓ |
| 框选多选 + 路径段跳转 + 面板内传输进度；打开目录不把 cwd 加入选区（防误删整夹） | `localFsOps`（sanitize/marquee/breadcrumb） | — | smoke `hostfs.safe-select-delete` | **✓** `local-fs` breadcrumb | ✓ |
| 多选删除须确认（禁无确认批量 rm） | — | TerminalFsDialog multi | smoke | — | ✓ |
| Host 树局部重载 | `localFsStore.reloadDirectory` | — | — | — | ✓ |
| Host 树 pointer 拖移 | `localFsPointerMove` | — | smoke | — | ✓ |
| Find in files（路径栏检索 → 文件列表） | — | — | smoke | **✓** | ✓ |
| 任务管理器 (进程/kill) | `taskManagerColumns.test` | — | smoke | **✓** | ✓ |
| 发送到 AI Chat | — | — | smoke | — | ✓ |
| 发送到其他服务器（多选 + 免密钥会话中继；目录 tar） | `localFsOps.resolveSendToPaths` + Rust `stream_transfer` tar cmds / `format_scp_failure` | — | — | — | ✓ |

## 6b. Host Browser (SSH SOCKS5)

| 功能 | 单元 | 集成 | 功能 | E2E | 用户 |
|------|:----:|:----:|:----:|:---:|:----:|
| Profile key / webview label | `browserProfile.test` | Rust `browser::tests` | smoke `ui.host-browser-*` / `ui.host-browser-dock` | **✓** `host-browser` | ✓ |
| SOCKS5 CONNECT → direct-tcpip | Rust `socks::tests` | curl via bridge | smoke | — | ✓（真机可选） |
| 回环 URL（`127.0.0.1` / localhost）走本地 TCP tunnel，地址栏仍显示原端口 | Rust `browser::tests` loopback retarget | — | smoke `webview_url_for` | — | ✓ |
| 多页签（按 host `sessionId` 隔离） | `browserTabs.test` | — | smoke tabs | **✓** tab new | ✓ |
| 切主机 tab 恢复工作区壳（终端/桌面/AI）；AI 后台继续跑不 abort | `hostWorkspaceMemory.test` + `aiEngineerHostContinue` + `panelVisibility` keep-mounted | — | smoke | ✓ soft-hide busy | ✓ |
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

## 8. AI Engineer（本机 + SSH Hosts）

| 功能 | 单元 | 集成 | 功能 | E2E | 用户 |
|------|:----:|:----:|:----:|:---:|:----:|
| Sidecar 启动 | — | healthz | smoke | — | ✓ |
| 多线程聊天历史（SQLite 索引 + 按 scope 拉正文；拒空覆盖） | `chatHistoryDisk` / persist | Rust `chat_history` | smoke | — | ✓ |
| AI 工具结束后静默思考 / tool_result 回传 | postToolResult + loop thinking status | stream loop | vitest | — | ✓ |
| 流式 SSE / Pull | — | pytest stream | — | hard_gates | ✓ |
| 安全模式 R0–R4 | `riskLabels.test` | pytest policy | — | — | ✓ |
| 审批 / 取消 / 缓存 | approval_cache + session semantics + panel hygiene | pytest approval | once/session/reject UI | approval e2e（含面板未崩） | ✓ |
| 主机记忆 (prefs/facts) | `test_host_memory` | — | host_memory_*；按 SSH 主机隔离 | — | ✓ |
| 个人记忆 (跨主机) | `test_user_memory` | — | user_memory_*；Home/Hosts 共用个人偏好 | — | ✓ |
| 手动提炼 Skill | `test_skill_writer` | — | skill_save + reply icon | — | ✓ |
| Skills 列表 UI | `test_skills_list_api` | — | Skills 菜单 | — | ✓ |
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
| 单一写者（无 Ask/Plan、无一起回答、无审批第二意见） | vitest `compareVoices` history | pytest `test_compare_voices` one writer | — | chat e2e composer 无模式切换 | ✓ |
| Investigator 子代理 | — | pytest | — | — | ✓ |
| Run trace 追踪 | — | pytest trace | — | — | ✓ |
| 中途 user_context | — | API surface | — | — | ✓ |
| Session resume | — | pytest resume + `stream_cursor=len(run.events)` (not SessionLog); transcript reconcile is this-turn only | — | resume | ✓ |
| SessionLog resume_miss（禁止静默薄 history；FE harness + 一次无 resume 重开） | `resumeMiss.test` + `test_session_resume` miss | chat_start 409 | smoke notice key | — | ✓ |
| SessionLog resume 跨 session_id（SSH 重连）+ FE 自动无 resume 重试 | `test_session_resume` remap | — | — | — | — |
| 0.0.2 External Agent Runtime（本地 CLI：Cursor/Codex/Claude + 行内状态图标 + install/login gate；TW MCP 远端闸门；`agent_runtime` 与模型一并持久化） | pytest `test_local_cli_probe` / `test_runtime_*` / `test_cursor_runtime` / `test_codex_runtime` / `test_claude_runtime` + vitest `cursorRuntimeStatus` / `externalAgentActivity` / `agentRuntime` | smoke `ai.runtime-picker` | E2E model menu Cursor/Codex/Claude | — | ✓ |
| External agent 执行 UX（抑制 `cursor.terminal_exec` 等与 TW 工具卡重复的 activity；ToolExecCard/WebCard 仅挂 Cursor/Codex/Claude 来源徽标） | vitest `externalAgentActivity` / `agentRuntime` / `approvalOptimisticExec` | smoke `ai.runtime-exec-agent-source` | 单卡脚本执行 + 来源标识 | — | ✓ |
| External agent 远端平面（「这台电脑」= SSH 被控主机；Codex `--disable computer_use` + workspace AGENTS.md；抑制 CUA/桌面冒充远端证据） | pytest `test_remote_plane` / `test_cli_stream_parse` | — | 不问本机显示器当远端事实 | — | ✓ |
| Local CLI stream 卡片（无空 cursor.tool）+ Cursor `.cursor/mcp.json` 与用户 `~/.cursor/mcp.json` + Claude `tw_mcp.json`（`type=stdio`、`alwaysLoad`）+ Codex `.codex/config.toml` 与 `-c` + Codex `item.completed`/`turn.completed` 解析 + `--approve-for-me` | pytest cli_stream_parse | 有内容的工具卡；远程走 TW MCP | 空 `{}` 卡被过滤；Codex 不再卡在等 stdin；Cursor/Claude 进程能看到 server `terminalwisely` | — | ✓ |
| External agent 问答连续性（原厂 resume；SessionLog 证据包含 tool；resume 被拒 / thread id 对不上 / 换模型或 Agent 后原厂会话过期 → 证据包重建；Codex 不再 `--ephemeral`） | pytest `test_cli_session_continuity` / `test_cli_prompt_history` | — | 同 Agent 追问 resume；跨模型/Agent 切换仍见完整 SessionLog | — | ✓ |
| 附件 (vision/office) | — | pytest | — | — | ✓ |
| 命令展示净化 | `commandDisplay.test` | pytest display | — | — | — |
| AI SSH lease（禁重连） | `sshLease.test` + Rust `ai_ssh_lease_tests` | — | TerminalView 闸门 | — | ✓ |
| Long-job exec idle 豁免 | Rust `ai_exec_limits` | — | timeout≥600 关 idle | — | ✓ |
| Run stall 看门狗（冷启动 + 工具后无进度；**工具执行中 / 审批中不误杀**；FE idle abort 同） | `test_stall_watch` + `thinkingIdleAbort.test` | main stall wrap | smoke + run_stalled 清 busy | — | ✓ |
| Wall-clock run 预算 | paths `max_run_wall_seconds` | loop `_check_budgets` | — | — | ✓ |
| Home Local Desktop Terminal/AI Local（Windows PowerShell；Home 目录无 AI/Terminal 工具入口；Terminal PTY、AI Local 会话在本机 Desktop 内打开；Local 与 SSH state 分桶） | `homeSplit.test` + `desktopTarget.test` + `desktopApps.test` + `desktopStore.test` + `local_terminal` | Rust local terminal / `fs_local` / local process / Browser commands | 固定 Home 标题栏标签；Smoke `ui.home-local-desktop` + `windows.local-coreutils-resource` | `home-host-directory`（Local 卡片开 Desktop）；`home-local-terminal-chat`（Desktop Terminal 复用本机 PTY、AI Local chat reuse、无独立 Terminal 标签） | Windows PowerShell/Coreutils 实际运行见 Windows CI |
| Local Desktop 工作区（显式 `DesktopTarget.local`；Files/Processes/Browser/Terminal/AI Local/MarkWisely 本机能力；AI Local 复用本机 `LOCAL_CHAT_SESSION`，AI Linux 仅 SSH；Local 与 SSH state 分桶；本机与 SSH 会话页签均展示 Desktop） | `desktopTarget.test` + `desktopApps.test` + `desktopStore.test` + Local FS/MarkWisely/Process/Browser store tests + `local_terminal` | Rust `fs_local` / local process / Browser commands | smoke `ui.home-local-desktop` + `windows.local-coreutils-resource` | `home-local-desktop`（本机 Files/Processes/Browser/MarkWisely 路径、SSH 状态隔离）；`home-local-terminal-chat`（Terminal 作为 Desktop 应用复用本机 PTY、AI Local chat reuse、无独立 Terminal 标签） | Windows PowerShell/Coreutils 实际运行见 Windows CI |
| Windows Home PowerShell Coreutils（Microsoft Coreutils 2026.9.3；x64/ARM64 资源；只注入应用子进程 PATH 并清理该 session 别名；不写 Profile/系统 PATH/注册表） | `local_terminal::tests` + `fetch-windows-coreutils.test.mjs` | Windows PowerShell 5.1 package smoke：`Get-Command ls`、PATH/Profile 不变；ARM64 包含资源 | smoke `windows.local-coreutils-resource` | Windows CI / Release matrix x64 运行、ARM64 资源检查 | Windows CI |

## 9. AI chat 可观测性

| 功能 | 单元 | 集成 | 功能 | E2E | 用户 |
|------|:----:|:----:|:----:|:---:|:----:|
| Run trace bar UI | — | — | smoke | ✓ | ✓ |
| flushUserContext / mid-run | — | API surface | smoke | — | ✓ |

## 10. Agent Sidecar 策略与工具

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
| 聊天滚动（长表格流式：table-layout fixed；半截 table 行补齐；触控板微 wheel 不弃贴底；settle 8s；streaming assistant 强制 follow） | `chatScroll.test` + `stabilizeStreamingMarkdown.test` + Playwright `ai-chat-scroll-maximize`（含新一轮从历史中段开始） | — | smoke `ai.chat-scroll-final` | ✓ | — |
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
| Mock Ollama 场景 | pytest director | — | — | configurable fixtures | — |

---

## 自动化入口

```bash
# 全量（推荐每次 PR / 发版前）
./scripts/run-all-tests.sh

# Playwright UI E2E（AI chat / SSH / Desktop — 无需人工）
npm run test:e2e

# 分项
npm test                          # 前端单元
npm run test:smoke                # 静态功能检查
cd agent-sidecar && pytest tests/ # Sidecar 单元+集成
cd src-tauri && cargo test        # Rust 单元
```

## CI 覆盖

`.github/workflows/ci.yml` 在 push/PR 时运行：`npm run build`、`npm test`、`test:smoke`、`cargo test`、`pytest`（Ubuntu）。

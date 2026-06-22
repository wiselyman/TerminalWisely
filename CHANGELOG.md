# Changelog

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

发布前请同步更新本文件与 [`RELEASE_NOTES.md`](./RELEASE_NOTES.md)（后者会出现在 GitHub Release 描述顶部）。历史版本归档在 [`release-notes/`](./release-notes/) 目录。

## [0.5.12] - 2026-06-15

### Fixed
- Linux / ARM64 Ubuntu 终端黑屏：字体 `document.fonts.load` 预加载不再阻塞 xterm 初始化

> 归档说明见 [`release-notes/v0.5.12.md`](./release-notes/v0.5.12.md)

## [0.5.11] - 2026-06-15

### Fixed
- Linux / Ubuntu 终端英文回退到系统默认等宽字体；内置 JetBrains Mono 与 Noto Sans Mono 并在 xterm 初始化前加载

> 归档说明见 [`release-notes/v0.5.11.md`](./release-notes/v0.5.11.md)

## [0.5.10] - 2026-06-15

### Changed
- Linux / Ubuntu 终端与预览：按主机 OS 选择等宽字体栈（含 CJK），统一 `--tw-mono-font` 与行高

> 归档说明见 [`release-notes/v0.5.10.md`](./release-notes/v0.5.10.md)

## [0.5.9] - 2026-06-18

### Added
- 服务器资源面板：磁盘读/写速度与累计 IO（SSH / Linux 本地）

### Changed
- 终端可点击路径：限定为 `ls` 输出与显式路径，避免误点登录行、docker 等普通文本
- 侧栏/预览/右侧面板变化时终端自动 refit

### Fixed
- SSH 预览/编辑 root 权限文件时 permission denied；支持 sudo 密码弹窗读写

> 归档说明见 [`release-notes/v0.5.9.md`](./release-notes/v0.5.9.md)

## [0.5.8] - 2026-06-17

### Fixed
- macOS / Linux CI 与 Release 构建失败（非 Windows 平台误引用 Windows-only shell 辅助函数）

> 归档说明见 [`release-notes/v0.5.8.md`](./release-notes/v0.5.8.md)

## [0.5.7] - 2026-06-15

### Changed
- Windows 本地终端：仅 Git Bash；未安装 Git for Windows 时提示安装，不再回退 PowerShell / MSYS2 / WSL
- Git Bash 本地路径、Find、预览与 `cygpath` 集成
- 书签与页签：Git Bash 本地终端命名；无会话时隐藏标签栏
- 首页「快速开始」与产品介绍更新

### Fixed
- 深色主题下 macOS Apple 等品牌图标不可见

> 归档说明见 [`release-notes/v0.5.7.md`](./release-notes/v0.5.7.md)

## [0.5.6] - 2026-06-15

### Changed
- 本地页签与书签：Windows / macOS / Linux OS 图标；书签首项固定本地终端；「+」仅新建 SSH
- Windows 本地 `~` 与 cd 路径；macOS 同级目录连续点击的路径解析
- SSH 连接表单：macOS 认证方式下拉框高度与输入框对齐

### Fixed
- Windows 本地图标变形；Windows `cd %USERPROFILE%` 失败

> 归档说明见 [`release-notes/v0.5.6.md`](./release-notes/v0.5.6.md)

## [0.5.5] - 2026-06-15

### Added
- 本地终端 → SSH 跨会话传文件：Shift+点击路径或 Ctrl/Cmd+拖拽到 SSH 标签，经 SFTP 上传至目标会话

### Changed
- 本地会话跟踪 cwd；Find、预览、路径点击与 SSH 一致的相对路径解析
- macOS 本地 Shell：`CLICOLOR=1` 彩色 ls；`ls -l` 支持 `@` / `+` 权限扩展标记
- 终端可点击路径下划线与悬停样式
- Find 与预览并排：打开预览时 Find 保持打开并左移，不再互相遮挡

> 归档说明见 [`release-notes/v0.5.5.md`](./release-notes/v0.5.5.md)

## [0.5.4] - 2026-06-08

### Changed
- 连接书签：未填连接名称时自动以 IP/主机地址保存；相同 host+port+用户更新已有书签
- 本地任务管理器（macOS / Linux / Windows 本地标签）与 SSH 一致：basic → ports 分阶段加载、2s/8s 轮询、骨架屏与列头端口 spinner
- 后端本地进程列表支持 `basic` / `ports` / `full` 三种模式

### Fixed
- Find 结果点击文件后预览被 Find 面板遮挡：打开预览时自动关闭 Find 等侧边抽屉
- 端口定时刷新不再因 `portsLoading` 长期占用而跳过轮询

> 归档说明见 [`release-notes/v0.5.4.md`](./release-notes/v0.5.4.md)

## [0.5.3] - 2026-06-13

### Changed
- SSH 任务管理器分阶段加载（进程列表 → 端口），会话缓存与骨架屏
- 默认隐藏内核线程；进程名使用 `comm`，修复 `[...]` 被 bash 误解析
- 结束进程后立即移除列表项，已结束 PID 在确认前不再闪回
- 轮询：CPU/内存 2s、端口 8s 分开刷新

### Fixed
- SSH 断开时停止刷新并提示「连接已断开」，替代 `Channel send error`
- 去掉「正在解析端口…」等状态行，避免面板布局跳动

> 归档说明见 [`release-notes/v0.5.3.md`](./release-notes/v0.5.3.md)

## [0.5.2] - 2026-06-12

### Fixed
- SFTP 上传大文件约 9% 卡住：流水线读写、512KB 分块、降低并发写
- `ll` 输出误将 `root`、日期等列识别为文件路径
- SSH 任务管理器端口：`ss` 无 pid、IPv6 地址、vLLM 父子进程等场景下的端口显示与过滤

> 归档说明见 [`release-notes/v0.5.2.md`](./release-notes/v0.5.2.md)

## [0.5.1] - 2026-06-08

### Added
- SSH 断开后按 Enter 重新连接：提示「按 Enter 重新连接」，无需关闭页签
- 页签右键菜单：关闭 / 关闭其他 / 关闭左侧 / 关闭右侧
- 后端 `reconnect_ssh_session` 命令与 `session-disconnected` 事件

### Changed
- 上传权限失败时给出更明确的 SFTP 写入权限说明

> 归档说明见 [`release-notes/v0.5.1.md`](./release-notes/v0.5.1.md)

## [0.5.0] - 2026-06-08

### Added
- Find 文件搜索：右侧贴边工具栏打开抽屉，在当前激活页签对应机器执行 `find` 命令（从当前目录搜索）
- 支持文件名模式（-name/-iname）、类型（-type f/d）、最大深度（-maxdepth）；结果可点击进入目录或预览
- 服务器资源检测：贴边工具栏第三枚图标，展示 CPU/内存/Swap、网络速率、磁盘、系统信息与登录用户
- 资源面板含 CPU/内存 gauge 与 sparkline；网络展示实时速率与累计流量
- 连接体验：乐观页签、连接中遮罩、首输出前启动提示，减少黑屏等待
- 后端 `find_files` / `get_session_cwd` / `get_host_stats` Tauri 命令

### Known limitations
- 本地 Windows 会话暂不支持 find，请使用 SSH Linux 主机
- Find 搜索范围为当前工作目录（SSH 跟踪 cwd）
- Find 单次最多 500 条结果
- 网络速率为采样差值，首帧显示「采样中…」
- SSH 资源采集依赖 `/proc`、`df`、`who`；最小化容器可能缺字段
- 任务管理器 / Find / 服务器资源 三个抽屉互斥

> 归档说明见 [`release-notes/v0.5.0.md`](./release-notes/v0.5.0.md)

## [0.4.0] - 2026-06-08

### Added
- 任务管理器：右侧贴边工具栏图标打开抽屉，展示当前激活页签对应机器（本地或 SSH）的进程列表
- 进程列：名称、监听端口、内存、CPU；支持搜索、排序与确认后结束进程
- 侧栏打开时约 2 秒自动刷新，关闭后停止轮询
- 后端 `list_processes` / `kill_process` Tauri 命令（本地 sysinfo + 端口映射；SSH exec JSON 脚本）

### Known limitations
- SSH 端口解析依赖 `ss` / `netstat`，部分最小化系统可能无端口列
- CPU 为采样值，首次打开可能偏低，第二次刷新后趋于准确
- 结束系统或其他用户进程可能权限不足（SSH 非 root 时常见）
- 端口展示以监听端口为主，不展示全部 ESTABLISHED 连接

> 归档说明见 [`release-notes/v0.4.0.md`](./release-notes/v0.4.0.md)

## [0.3.0] - 2026-06-08

### Added
- 单击终端文件路径打开应用内预览面板（Local + SSH）
- 文本 / Markdown / CSV 全文搜索与高亮跳转
- 图片、PDF、CSV 预览与「系统打开」
- 预览 API（`preview_open` / `preview_close` / `probe_path`）与 SFTP 缓存
- 预览面板可拖拽宽度并持久化
- 页签快捷目录（`~`、彩色文件夹、`+` 添加、右键编辑）
- SSH 页签远程系统图标

### Changed
- 工作区分栏布局（终端 | 预览）
- 页签宽度按内容自适应
- 产品引导、README 与 MIT 许可证更新

### Fixed
- 带引号 shell 路径点击预览/下载报错

> 归档说明见 [`release-notes/v0.3.0.md`](./release-notes/v0.3.0.md)

## [0.2.0] - 2026-06-08

### Added
- 跨服务器文件 relay 传输（Shift+点击、Ctrl+拖拽到 SSH 标签）
- 多任务传输面板与按 `transfer_id` 独立取消
- 书签 OS 图标与编辑、侧栏收起态书签 rail
- 页签指针拖拽排序、`+` 新建菜单

### Changed
- 传输进度即时显示；下载连接阶段可取消
- 侧栏收起仅保留展开按钮；rail 悬停显示书签别名

### Fixed
- Ctrl/Cmd+点击下载在拖拽功能后失效
- 页签排序误触发终端「上传文件」提示
- 收起侧栏底部滚动条箭头

> 归档说明见 [`release-notes/v0.2.0.md`](./release-notes/v0.2.0.md)

## [0.1.0] - 2026-06-04

### Added
- 本地 PTY 终端与 SSH 远程终端，多标签工作区
- SFTP 拖拽上传到 SSH 当前目录
- `ls` 输出点击目录自动 `cd`
- Ctrl / Cmd + 点击路径下载到 `Downloads/TerminalWisely`
- 本地终端拖入文件插入路径
- SSH 密码 / 私钥连接与书签保存、一键重连
- GitHub Actions 多平台 Release（Windows / macOS / Linux，含 x86_64 与 ARM64）

> 归档说明见 [`release-notes/v0.1.0.md`](./release-notes/v0.1.0.md)

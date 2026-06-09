# Changelog

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

发布前请同步更新本文件与 [`RELEASE_NOTES.md`](./RELEASE_NOTES.md)（后者会出现在 GitHub Release 描述顶部）。历史版本归档在 [`release-notes/`](./release-notes/) 目录。

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

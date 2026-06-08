# Changelog

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

发布前请同步更新本文件与 [`RELEASE_NOTES.md`](./RELEASE_NOTES.md)（后者会出现在 GitHub Release 描述顶部）。历史版本归档在 [`release-notes/`](./release-notes/) 目录。

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

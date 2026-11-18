# TerminalWisely v0.1.3

## English

TerminalWisely 0.1.3 restores Home as a host directory, with Local pinned above saved SSH hosts grouped by the user's existing layout.

### Highlights

- **Home host directory** — open local Terminal and chat from Home, or select Local / an SSH host to open its Desktop workspace in a titlebar tab
- **Local Desktop tab** — open the local Desktop without creating an SSH session; Local and SSH workspaces retain separate state
- **Saved SSH hosts** — reuse the existing credential prompt and connection flow, then open Desktop in the new SSH session tab
- **Home chrome** — remove the sidebar collapse control and AI/Desktop shortcuts while the Home directory is active

## 中文

TerminalWisely 0.1.3 恢复 Home 主机目录，Local 固定在最上方，已保存 SSH 主机沿用现有分组布局。

### 主要更新

- **Home 主机目录** — 可从 Home 进入本机 Terminal 和聊天，也可选择 Local 或 SSH 主机，在标题栏标签打开对应 Desktop
- **本机 Desktop 标签** — 打开本机 Desktop 时不创建 SSH 会话；本机与 SSH 工作区状态保持隔离
- **已保存 SSH 主机** — 沿用现有凭据提示和连接流程，在新 SSH 会话标签打开 Desktop
- **Home 界面** — Home 目录显示时不提供侧栏收起控件或 AI/Desktop 快捷按钮

## English

TerminalWisely 0.1.2 focuses the product on local Home and remote SSH Hosts workspaces, with Terminal and Desktop tools.

### Highlights

- **EditorWisely** — edit local and SSH-host text/source files with CodeMirror 6, syntax highlighting, multi-document tabs, find/replace, autosave, explicit save, and unsaved-change protection
- **Text fidelity** — preserve UTF-8, UTF-8 BOM, and LF/CRLF line endings; report binary files, unsupported encodings, and read/write errors without discarding edits
- **Open from Files** — launch text files from the Home or Host file manager using the existing local filesystem or SSH session
- **File manager** — sort by name, size, and modified time; keep Desktop app icons visible in a separate column at shorter window heights
- **Focused workspaces** — retain local and remote Terminal/Desktop workflows and MarkWisely; remove retired workspace UI and clean its app-owned legacy data while preserving SSH/AI credentials and user configuration

## 中文

TerminalWisely 0.1.2 聚焦本机 Home 与远程 SSH Hosts 工作区，提供 Terminal 和 Desktop 工具。

### 主要更新

- **EditorWisely** — 使用 CodeMirror 6 编辑本机和 SSH 主机上的文本/源码，支持语法高亮、多文档标签、查找替换、自动保存、手动保存和未保存保护
- **保留文本格式** — 保留 UTF-8、UTF-8 BOM 和 LF/CRLF 换行；遇到二进制文件、不支持的编码或读写错误时保留编辑内容并提示
- **从文件管理器打开** — 在 Home 或主机文件管理器中打开文本文件，沿用本机文件系统或当前 SSH 会话
- **文件管理器** — 支持按名称、大小、修改时间排序；较矮窗口中的桌面应用图标仍完整显示在独立列
- **聚焦核心工作区** — 保留本机和远程 Terminal/Desktop 与 MarkWisely；移除退役工作区界面并清理应用自有遗留数据，同时保留 SSH/AI 凭据和用户配置

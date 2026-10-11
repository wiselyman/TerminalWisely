# TerminalWisely v0.0.6

## English

Hosts, Kubernetes, and Databases now share one set of chrome. This release adds no features.

### Highlights

- **One selection** — a selected connection is a single accent border. A selected tree row keeps the normal text color
- **One set of sizes** — list inset, row padding, group labels, icon buttons, search fields, and the tabs inside a workspace match across the three sidebars
- **Empty states** — with no cluster selected, the workspace shows the existing hint. An empty database result uses the same empty style
- **Checks** — tab menus (close others, close to the left), the version in Settings, language and theme across the three sidebars, and sidebar width after a reload
- **Title-bar plus** — on Hosts it adds a server, on Kubernetes a cluster, on Databases a connection
- **Typing** — the first letter in an empty field stays as you typed it
- **Dialogs** — Add cluster uses the same compact footer as the other dialogs
- **Windows agents** — Cursor, Codex, and Claude Code sign-in opens the system browser. A slow probe no longer marks an installed CLI as missing

Installers: Windows, macOS (arm64 + x64), Linux (deb / rpm / AppImage where available).

### macOS

If macOS says the app is damaged and should be moved to the Trash, it is the download quarantine flag. After installing to `/Applications`:

```bash
xattr -cr /Applications/TerminalWisely.app
```

---

## 中文

主机、Kubernetes、数据库现在共用一套界面。这一版没有新功能。

### 要点

- **同一种选中** — 选中的连接是一条强调色边。树里选中的一行仍用普通文字颜色
- **同一套尺寸** — 列表留白、行内边距、分组标题、图标按钮、搜索框，以及工作区里的页签，三条侧栏对齐
- **空状态** — 还没选集群时，工作区显示已有的提示。数据库查不到行时用同一套空状态
- **检查** — 页签菜单（关闭其他、关闭左侧）、设置里的版本号、三条侧栏上的语言和主题，以及刷新后侧栏宽度还在
- **标题栏加号** — 主机上添加服务器，Kubernetes 上添加集群，数据库上新建连接
- **输入** — 空输入框的第一个字母保持你按下的样子
- **弹框** — 添加集群和其它对话框一样，动作在右下角
- **Windows 上的 Agent** — Cursor、Codex、Claude Code 登录会打开系统浏览器。探测变慢时，已安装的 CLI 不再显示成未安装

安装包：Windows；macOS（arm64 / x64）；Linux（deb / rpm / AppImage，视平台而定）。

### macOS

若提示「TerminalWisely」已损坏，无法打开，你应该将它移到废纸篓：应用没有损坏，是下载隔离属性。放入「应用程序」后执行：

```bash
xattr -cr /Applications/TerminalWisely.app
```

# TerminalWisely v0.0.4

## English

A connected Linux host is now a desktop. Click the host icon and the workspace beside the sidebar becomes that machine.

### Highlights

- **Host desktop** — wallpaper, icons, and a dock. Sidebar, title bar, and status bar stay. Click the host icon again to return to the terminal
- **Five apps** — Files, Processes, Browser, Terminal, and AI Linux. Terminal and AI Linux are the session you already have, laid out inside a window
- **Browser uses the host network** — pages, including `127.0.0.1`, go through the existing SSH session
- **Windows** — drag, resize, and stack. Leave the desktop and come back: the open windows and their positions are still there

Installers: Windows, macOS (arm64 + x64), Linux (deb / rpm / AppImage where available).

### macOS

If macOS says the app is damaged and should be moved to the Trash, it is the download quarantine flag. After installing to `/Applications`:

```bash
xattr -cr /Applications/TerminalWisely.app
```

---

## 中文

已连接的 Linux 主机现在可以是一台桌面。点主机图标，侧栏右边的工作区就变成这台机器。

### 要点

- **主机桌面** — 壁纸、图标、Dock。侧栏、标题栏、状态栏留在原地。再点主机图标回到终端
- **五个应用** — 文件、进程、浏览器、终端、AI Linux。终端和 AI Linux 就是你已经连上的那条会话，放进窗口里
- **浏览器走主机网络** — 网页（含 `127.0.0.1`）经现有 SSH 会话出去
- **窗口** — 可拖动、缩放、叠放。离开桌面再回来，打开的窗口和位置还在

安装包：Windows；macOS（arm64 / x64）；Linux（deb / rpm / AppImage，视平台而定）。

### macOS

若提示「TerminalWisely」已损坏，无法打开，你应该将它移到废纸篓：应用没有损坏，是下载隔离属性。放入「应用程序」后执行：

```bash
xattr -cr /Applications/TerminalWisely.app
```

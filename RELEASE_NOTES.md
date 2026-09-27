# TerminalWisely v0.0.2

## English

Bring **Cursor Agent**, **Codex**, and **Claude Code** into real ops — on the live SSH session and Kubernetes cluster you already opened.

### Highlights

- **Agent runtimes** — pick Built-in, Cursor, Codex, or Claude Code; remote work goes through **TW MCP** on the same session / cluster (no second SSH login)
- **One approval plane** — R0 reads can auto-run; mutations show TW approval cards with agent source; **STOP** kills the run
- **Guided readiness** — probe install + login; walk through sign-in; wire MCP / workspace automatically; never silently install CLIs
- **Dual-plane UX** — local CLI stream + remote exec cards without duplicate noise
- **Built-in Engineers** — AI Linux / K8S modes still available with your model profiles
- **SSH terminal** — multi-tab sessions, bookmarks, reconnect, English / 中文 UI
- **Host Desktop / Browser** — Files, Processes, Browser on the connected host; remote HTTP via live SSH
- **Kubernetes** — sidebar Hosts ↔ K8s; kubeconfig or SSH kubectl; resource tree, YAML, logs, Pod shell
- **Safety** — policy-graded commands; API keys on-device; model cannot bypass CommandBroker
- **Insight** — host CPU, memory, disk I/O, and network on the status bar

This rebuild also keeps the bundled Python matched to the host OS, leaves model settings as profiles only, expands the Ungrouped host group by default, and rejects a Base URL pasted into the API key field.

Installers: Windows, macOS (arm64 + x64), Linux (deb / rpm / AppImage where available).

Requires the corresponding CLI installed and signed in when using Cursor / Codex / Claude Code runtimes.

### macOS

If macOS says the app is damaged and should be moved to the Trash, it is the download quarantine flag. After installing to `/Applications`:

```bash
xattr -cr /Applications/TerminalWisely.app
```

---

## 中文

把 **Cursor Agent**、**Codex**、**Claude Code** 接到真实运维——就在你已打开的 SSH 会话与 Kubernetes 集群上。

### 要点

- **Agent 运行时** — 可选内置 / Cursor / Codex / Claude Code；远端操作经 **TW MCP** 走同一会话 / 集群（不另开 SSH）
- **统一审批面** — R0 只读可自动；变更走 TW 批准卡片（标注来源）；**STOP** 终止运行
- **引导式就绪** — 探测安装与登录、引导登录、自动接线 MCP / 工作区；不静默安装 CLI
- **双平面 UX** — 本机 CLI 流 + 远端执行卡片，避免重复噪音
- **内置工程师** — AI Linux / K8S 模式与自有模型 Profile 仍可用
- **SSH 终端** — 多标签、书签、断线重连、中英文界面
- **主机 Desktop / Browser** — 已连接主机上的文件 / 进程 / 浏览器；经 SSH 访问远端 HTTP
- **Kubernetes** — 侧栏 Hosts ↔ K8s；kubeconfig 或 SSH kubectl；资源树、YAML、日志、Pod Shell
- **安全** — 命令能力分级；API Key 本机；模型不能绕过 CommandBroker
- **可观测** — 状态栏 CPU、内存、磁盘与网络

本次重新打包还会：只选用当前系统的内置 Python；模型设置只保留模型配置；主机「未分组」默认展开，新建主机可选分组；把网址填进 API Key 时会直接拦住。

安装包：Windows；macOS（arm64 / x64）；Linux（deb / rpm / AppImage，视平台而定）。

使用 Cursor / Codex / Claude Code 运行时需本机已安装并登录对应 CLI。

### macOS

若提示「TerminalWisely」已损坏，无法打开，你应该将它移到废纸篓：应用没有损坏，是下载隔离属性。放入「应用程序」后执行：

```bash
xattr -cr /Applications/TerminalWisely.app
```

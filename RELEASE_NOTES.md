# TerminalWisely v0.0.3

## English

Same chat, different brains. In one AI Engineer conversation you can switch built-in models and Cursor, Codex, or Claude Code, and the work continues.

### Highlights

- **One thread, any runtime** — follow-ups stay on the same TerminalWisely chat whether the answering side is a configured model or an installed agent CLI
- **Vendor session when it still matches** — Cursor, Codex, and Claude Code resume their own session while that session is still the latest work on the thread
- **SessionLog when it does not** — if you switched models or agents in between, or the vendor session is missing or rejected, the next turn is rebuilt from the chat record, including tool output such as remote command results
- **Codex sessions can be resumed** — exec no longer marks the session ephemeral

Installers: Windows, macOS (arm64 + x64), Linux (deb / rpm / AppImage where available).

Requires the corresponding CLI installed and signed in when using Cursor / Codex / Claude Code.

### macOS

If macOS says the app is damaged and should be moved to the Trash, it is the download quarantine flag. After installing to `/Applications`:

```bash
xattr -cr /Applications/TerminalWisely.app
```

---

## 中文

同一条对话，换大脑也能接着做。在一条 AI 工程师对话里切换内置大模型，或 Cursor、Codex、Claude Code，工作不会从头再来。

### 要点

- **一条对话，任意运行时** — 回答方是已配置的大模型，或本机已安装的 Agent CLI，追问都留在同一条 TerminalWisely 聊天里
- **原厂会话还对得上时接着用** — Cursor、Codex、Claude Code 在自己的会话仍是这条聊天的最新工作时，沿用该会话
- **对不上时用会话记录重建** — 中途换过模型或 Agent，或原厂会话丢失、被拒绝时，下一句按聊天记录重建，包含远端命令等工具输出
- **Codex 会话可以续接** — exec 不再把会话标成一次性

安装包：Windows；macOS（arm64 / x64）；Linux（deb / rpm / AppImage，视平台而定）。

使用 Cursor / Codex / Claude Code 时需本机已安装并登录对应 CLI。

### macOS

若提示「TerminalWisely」已损坏，无法打开，你应该将它移到废纸篓：应用没有损坏，是下载隔离属性。放入「应用程序」后执行：

```bash
xattr -cr /Applications/TerminalWisely.app
```

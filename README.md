# TerminalWisely

<p align="center">
  <img src="./docs/images/app-icon.svg" alt="TerminalWisely" width="160" height="160" />
</p>

**English** | [中文](./README.zh-CN.md)

**SSH terminal + AI Linux Engineer.** Connect to your servers, work with files in a visual workspace, and describe problems in plain English — the built-in agent investigates on the **live session**, runs read-only checks automatically, and asks before anything mutates the host.

[Download](https://github.com/wiselyman/TerminalWisely/releases) · [Build from source](./BUILD.md)

<p align="center">
  <img src="./docs/images/promo-ai-engineer-en.jpg" alt="SSH terminal with AI Linux Engineer" width="920" />
</p>

---

## What you get

| Area | Highlights |
|------|------------|
| **Terminal** | Multi-tab SSH, bookmarks, reconnect, English / 中文 UI |
| **Files** | Drag-and-drop upload, click `ls` paths to `cd` or preview, download, compress, cross-server send |
| **AI Engineer** | Natural-language ops on the connected host; per-server chat history |
| **Models** | OpenAI-compatible APIs, Ollama, Anthropic-compatible gateways, Gemini |
| **Safety** | Policy-graded commands (read / mutate / deny); approval cards; stop anytime |
| **Insight** | Host CPU, memory, disk I/O, and network on the status bar |

<p align="center">
  <img src="./docs/images/promo-model-settings-en.jpg" alt="Model profiles" width="920" />
</p>

---

## AI Linux Engineer

Open **AI Engineer** from the title bar, pick a connected host, and describe what you need — disk full, port in use, service down, GPU memory, and so on.

- **Same session** — commands use your existing SSH connection; no hidden second login.
- **Evidence first** — the agent reads output on the machine before concluding.
- **You stay in control** — read-only probes can run on their own; writes, deletes, and network changes need your explicit approval on that exact command.
- **Bring your model** — save multiple profiles (cloud or local) and switch the active one in Settings.

### Example asks

| You say | What happens |
|---------|----------------|
| “Find what’s eating disk” | `df` / `du` drill-down |
| “Who listens on 8080?” | Socket / process lookup; kill only after approval |
| “nginx returns 502” | Status, logs, upstream checks |
| “GPU memory right now” | `nvidia-smi` and related read-only probes |

---

## Terminal & files

- **Upload** — drop files onto the terminal or tab → SFTP to the current directory  
- **Navigate** — click directory names in `ls` output  
- **Preview & edit** — click file paths; syntax highlight and search for text  
- **Download** — Ctrl/Cmd + click a path, or use the context menu  
- **Send elsewhere** — right-click a path, or drag to another SSH tab  
- **Command Nav** — 90+ ops snippets inserted into the shell (never auto-run)

---

## Quick start

1. Add an SSH host in the sidebar and connect.  
2. Optional: open **AI Engineer** → Settings → add a model profile (Base URL + model id; Ollama often needs no key).  
3. Use the terminal as usual; ask the AI when you want help on that host.  
4. Approve or reject any command the agent marks as a system change.

---

## Download

Installers for **Windows**, **macOS** (Apple Silicon & Intel), and **Linux** (deb, rpm, AppImage; x86_64 & ARM64) are on the [Releases](https://github.com/wiselyman/TerminalWisely/releases) page.

The AI runtime ships inside the app. The first time you open AI Engineer, dependencies install automatically in the background (progress is shown in the UI).

---

## License

[MIT](./LICENSE)

# TerminalWisely

<p align="center">
  <img src="./docs/images/app-icon.svg" alt="TerminalWisely" width="160" height="160" />
</p>

**English** | [中文](./README.zh-CN.md)

**Current version: [v0.0.2](https://github.com/wiselyman/TerminalWisely/releases/tag/v0.0.2)**

**Bring Cursor Agent, Codex, and Claude Code into real ops — on your live SSH session and Kubernetes cluster.** TerminalWisely is the desktop cockpit: multi-tab SSH, host Desktop / Browser, K8s workbench, and AI Engineers. In **v0.0.2**, the coding agents you already use become **ops agents**: they keep their own brains and login, while TW owns the session, MCP tools, approval cards, and STOP.

[Download](https://github.com/wiselyman/TerminalWisely/releases) · [Build from source](./BUILD.md)

<p align="center">
  <img src="./docs/images/v002-01-chat-agent-ops.png" alt="Figure 1 — Chat: Cursor agent on a live SSH host" width="920" />
</p>
<p align="center"><em>Figure 1 — A normal AI Engineer chat: ask in plain language; Cursor (or another agent) runs tools on the connected host and answers with evidence.</em></p>

---

## What’s new in v0.0.2

| | |
|--|--|
| **Cursor / Codex / Claude Code → ops** | Pick an installed CLI as the agent runtime. It investigates through **TW MCP** on the **same** SSH / cluster you already opened — not a second login. |
| **One approval plane** | Read-only probes can auto-run; mutations show TW approval cards (with agent source). **STOP** kills the run. |
| **Guided setup** | TW probes install + login status, walks you through sign-in when needed, and wires MCP / workspace automatically. It does **not** silently install CLIs. |
| **Built-in Engineers still here** | AI Linux / K8S Engineers with your own model profiles (OpenAI-compatible, Ollama, Anthropic-compatible, Gemini). |

---

## What you get

| Area | Highlights |
|------|------------|
| **Agent runtimes** | Cursor Agent, Codex, Claude Code on live SSH / K8s via TW MCP; dual-plane UX (local CLI stream + remote exec cards) |
| **Terminal** | Multi-tab SSH, bookmarks, reconnect, English / 中文 UI |
| **Host Desktop** | Dock apps on the connected host: Files, Processes, Browser; layout remembered per host |
| **Host Browser** | Open remote HTTP (including `127.0.0.1`) via the existing SSH session; multi-tab, history, bookmarks |
| **Kubernetes** | Sidebar Hosts ↔ K8s; add cluster via + (file or paste kubeconfig) or SSH kubectl; resource tree, YAML, logs, Pod shell. One-click install of kubectl/Helm into the app data dir (or use PATH / SSH). Practical Lens-inspired subset — not a full Lens IDE |
| **Files** | Drag-and-drop upload, click `ls` paths to `cd` or preview; Markdown Typora-like WYSIWYG; download, compress, cross-server send |
| **AI Engineer** | Linux mode on SSH hosts; K8S mode on selected clusters; long runs keep the SSH lease; separate chat history |
| **Models** | OpenAI-compatible APIs, Ollama, Anthropic-compatible gateways, Gemini |
| **Safety** | Policy-graded commands (read / mutate / deny); approval cards; stop anytime |
| **Insight** | Host CPU, memory, disk I/O, and network on the status bar |

---

## Models & agents

Switch between **Model** (built-in profiles you configure) and **Agent** (local CLIs) from the picker under the composer.

<p align="center">
  <img src="./docs/images/v002-02-model-picker.png" alt="Figure 2 — Model picker" width="420" />
</p>
<p align="center"><em>Figure 2 — Model selection: pick a configured profile (OpenAI-compatible, Ollama, …) or open Manage models…</em></p>

<p align="center">
  <img src="./docs/images/v002-03-agent-picker.png" alt="Figure 3 — Agent picker" width="420" />
</p>
<p align="center"><em>Figure 3 — Agent selection: Cursor, Codex, and Claude Code when the local CLI is installed and ready.</em></p>

### Cursor / Codex / Claude Code as ops agents

Open **AI Engineer** → pick a runtime (**Built-in**, **Cursor**, **Codex**, or **Claude Code**).

- **Their agent, your session** — the CLI runs locally; remote work goes through TW’s MCP (`terminal_exec`, `k8s_*`, …) on the session you already own.
- **No shadow SSH** — same lease as the terminal tab; long runs keep it alive.
- **Approvals stay in TW** — capability grades (R0–R4); mutations need exact target-bound approval; agent source is labeled on the card.
- **Install & login guidance** — missing CLI or expired auth surfaces as a guided flow, not a silent background install.

Requires the corresponding CLI installed and signed in on your machine (Cursor Agent / Codex / Claude Code).

### Built-in AI Linux & K8S Engineers

Mode follows the sidebar:

- **Hosts** → **AI Linux Engineer** on the connected SSH session (`terminal_exec`)
- **K8s** → **AI K8S Engineer** on the selected cluster (`k8s_list` / `k8s_get` / `k8s_logs` / …)

- **Same session / cluster** — no hidden second SSH login; kubectl jumps use the bound session.
- **Evidence first** — the agent reads output before concluding.
- **You stay in control** — read-only probes can run on their own; writes need your explicit approval.
- **Bring your model** — save multiple profiles (cloud or local) and switch the active one in Settings.

### Example asks

| You say | What happens |
|---------|----------------|
| “Find what’s eating disk” | `df` / `du` drill-down (Linux) |
| “Who listens on 8080?” | Socket / process lookup; kill only after approval |
| “Why is this Pod CrashLooping?” | `k8s_describe` / `k8s_logs` on the selected cluster |
| “Scale api to 3” | `k8s_scale` after approval |
| “nginx 502” | Status, logs, upstream checks |
| “How much GPU memory?” | Read-only checks such as `nvidia-smi` |

---

## Host Desktop on Linux

Open a desktop surface on the connected SSH host: **Files**, **Processes**, and **Browser** as dock apps. Preview and edit common files WYSIWYG-style (Markdown and more) without leaving the session.

<p align="center">
  <img src="./docs/images/v002-04-host-desktop.jpg" alt="Figure 4 — Host Desktop" width="920" />
</p>
<p align="center"><em>Figure 4 — Host Desktop beside the live SSH terminal: Files / Processes / Browser dock on the connected Linux host.</em></p>

<p align="center">
  <img src="./docs/images/v002-05-host-files.jpg" alt="Figure 5 — Host Files" width="920" />
</p>
<p align="center"><em>Figure 5 — Host Files: browse the remote filesystem with a Finder-style tree and grid.</em></p>

<p align="center">
  <img src="./docs/images/v002-06-markdown-wysiwyg.png" alt="Figure 6 — Markdown WYSIWYG" width="720" />
</p>
<p align="center"><em>Figure 6 — Markdown WYSIWYG editing (Typora-like) on the remote host.</em></p>

<p align="center">
  <img src="./docs/images/v002-07-host-processes.jpg" alt="Figure 7 — Host Processes" width="920" />
</p>
<p align="center"><em>Figure 7 — Host Processes: name, ports, memory, and CPU; end a process after confirm.</em></p>

<p align="center">
  <img src="./docs/images/v002-08-host-browser.jpg" alt="Figure 8 — Host Browser" width="920" />
</p>
<p align="center"><em>Figure 8 — Host Browser: open HTTP on the <strong>host’s network</strong> (including <code>127.0.0.1</code>) through the existing SSH session.</em></p>

<p align="center">
  <img src="./docs/images/v002-09-file-preview-log.jpg" alt="Figure 9 — Log / text preview" width="920" />
</p>
<p align="center"><em>Figure 9 — Preview and search common files such as logs on the remote host.</em></p>

<p align="center">
  <img src="./docs/images/v002-10-file-preview-image.jpg" alt="Figure 10 — Image preview" width="920" />
</p>
<p align="center"><em>Figure 10 — Image and other mainstream file types open in the preview panel.</em></p>

### Terminal & transfers

- **Upload** — drop files onto the terminal or tab → SFTP to the current directory  
- **Navigate** — click directory names in `ls` output  
- **Preview & edit** — click file paths; Markdown is Typora-like WYSIWYG; syntax highlight and search for text  
- **Download** — Ctrl/Cmd + click a path, or use the context menu  
- **Send elsewhere** — right-click a path, or drag to another SSH tab  
- **Command Nav** — 90+ ops snippets inserted into the shell (never auto-run)

---

## Kubernetes workbench

Sidebar **Hosts ↔ K8s**: overview, workloads, network, storage, and security resources — plus AI on the selected cluster.

<p align="center">
  <img src="./docs/images/v002-11-k8s-ops.png" alt="Figure 11 — Kubernetes ops" width="920" />
</p>
<p align="center"><em>Figure 11 — Kubernetes ops: cluster overview and AI Engineer answering whether the cluster is healthy.</em></p>

---

## Quick start

1. Add an SSH host in the sidebar and connect — or switch the activity bar to **K8s** and click **+** to add a cluster (kubeconfig file or paste).  
2. Optional: open **Desktop** or **Browser** on the connected host to manage files/processes or open remote HTTP UIs.  
3. Optional: open **AI Engineer** → choose a runtime (Built-in model, or Cursor / Codex / Claude Code if installed).  
4. For Built-in: Settings → add a model profile (Base URL + model id; Ollama often needs no key).  
5. Use the terminal or K8s workbench as usual; ask the AI when you want help.  
6. Approve or reject any command the agent marks as a system change.

Kubernetes notes: local cluster ops prefer kubectl/Helm installed into the app data directory (one-click from the UI), with PATH as fallback; SSH jump hosts still use the remote PATH. The K8s UI is a practical Lens-inspired subset — not a full Lens IDE.

---

## Download

Installers for **Windows**, **macOS** (Apple Silicon & Intel), and **Linux** (deb, rpm, AppImage; x86_64 & ARM64) are on the [Releases](https://github.com/wiselyman/TerminalWisely/releases) page.

The AI runtime ships inside the app. The first time you open AI Engineer, dependencies install automatically in the background (progress is shown in the UI).

### macOS

If macOS says **“TerminalWisely” is damaged and can’t be opened** and asks you to move it to the Trash, the app is not damaged. Gatekeeper quarantined the download. Copy it to `/Applications`, then run:

```bash
xattr -cr /Applications/TerminalWisely.app
```

Open TerminalWisely again.

---

## License

[MIT](./LICENSE)

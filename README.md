# TerminalWisely

**English** | [中文](./README.zh-CN.md)

**Fix Linux with natural language.** A cross-platform desktop terminal with SSH/SFTP and a built-in **AI Linux Engineer** — describe problems in English or Chinese on a connected host; the AI proposes commands, then executes and verifies them under a security policy.

Current version: **v1.0.0**

[Download](https://github.com/wiselyman/TerminalWisely/releases) · [Build](./BUILD.md) · [Changelog](./CHANGELOG.md)

<p align="center">
  <img src="./docs/images/promo-ai-engineer.jpg" alt="TerminalWisely — SSH terminal beside AI Linux Engineer inspecting GPU memory and processes" width="920" />
</p>

<p align="center">
  <img src="./docs/images/promo-model-settings.jpg" alt="TerminalWisely — AI model profiles with one-click Active switch" width="920" />
</p>

---

## AI Linux Engineer: solve Linux problems in natural language

Open **AI Engineer** in the title bar, select a connected host, and describe what you see. The sidecar runs and verifies on the **current SSH session** — real machine evidence, not guesswork.

### Which models can you connect?

Manage **model profiles** in Settings: save several and switch the Active one in one click. Four connection types cover most online APIs and local/offline stacks:

| Type | Best for | Notes |
|------|----------|--------|
| **OpenAI-compatible** | Most cloud and self-hosted APIs | Base URL (`/v1`) + API key + model id. Works with OpenAI, DeepSeek, Tongyi/Zhipu-style gateways, and self-hosted **vLLM, LM Studio, LocalAI**, etc. |
| **Ollama** | Local / intranet offline models | Talks to local Ollama; usually **no API key**. Good for air-gapped or on-device runs. |
| **Anthropic-compatible** | Claude via a compatible gateway | OpenAI-compatible gateway that serves Anthropic models. |
| **Gemini** | Google Gemini | Gemini’s OpenAI-compatible endpoint. |

If a model exposes **OpenAI-style Chat Completions** (or one of the types above), you can usually plug it into AI Linux Engineer without changing the client.

### Agent capabilities

AI Linux Engineer is not a chat box that pastes “suggested commands.” It is an in-app **ops agent** closed-looped on the connected host:

1. **Real session execution**  
   Commands go through the app’s existing SSH/terminal capture path (`terminal_exec`) — no second silent login. The terminal you see and the host the AI uses are the same machine.

2. **Multi-tool loop**  
   - Run commands and read output on the host  
   - **Ask you questions** (`ask_user`) to clarify goals — asking is not approval  
   - **Web search / fetch docs** (`web_search` / `web_fetch`) as reference only; external content is data, never authority  
   - Optionally structure an ops plan (`submit_ops_plan`)

3. **Dynamic investigation, not a hard-coded playbook**  
   Unknown issues move via observe → hypothesize → act again. Read-only steps can run automatically; writes/deletes/network changes need **exact UI approval** (approval invalidates if the target changes).

4. **Security decided by the Harness, not model obedience**  
   A capability policy engine grades commands (read / mutate / catastrophic). Unknown binaries are biased strict; risky firewall/SSH changes can include a **timed rollback**. You can always **stop the AI**.

5. **Per-host chats and controllable runs**  
   Conversations are bucketed by server; history, stop, and mid-run corrections are supported; security modes include stricter production double-confirm.

### Example prompts

| You say | The agent roughly does |
|---------|------------------------|
| “Disk is full — find the largest directories” | `df` / `du` drill-down; reads auto-run; mutate steps wait for approval |
| “What’s on port 8080 — can we free it?” | `ss`/`lsof` to find the process; kill needs confirm |
| “nginx is 502” | Status, error logs, upstream/ports → conclusion and next steps |
| “Docker ate tens of GB — images or overlay?” | `docker system df`, image/container inventory (read-only) |
| “Is the firewall enabled on this box?” | `which` / `systemctl is-active` style probes — **won’t** rewrite iptables just to check |
| “Show current GPU memory usage” | Runs `nvidia-smi` (and related) on GPU hosts; summarizes usage and processes |

### How security works (important)

**The model only proposes. The Harness decides what may run.**

1. **Capability policy engine (not keyword panic)**  
   Commands are split into leaf commands, `sudo`/`xargs` peeled off, then labeled by argv (`read` / `write` / `delete` / `net_mutate` / …) and mapped to R0–R4.  
   Defaults live in [`agent-sidecar/policy/`](./agent-sidecar/policy/); you can drop `overrides.yaml` in the data directory.

2. **Graded handling**  
   - **R0 read-only**: auto-run (e.g. `du`, `systemctl status`, “is firewall installed?” probes)  
   - **R2/R3 mutate**: exact UI approval of that command  
   - **R4 catastrophic**: hard deny (e.g. `rm -rf /`)

3. **Unknown binaries are strict**  
   Binaries missing from the policy (unless pure flag probes) default to approval — so `./install.sh /opt/...` does not run silently.

4. **Anti lock-out for network changes**  
   Real firewall / SSH / routing mutations can get a **timed rollback** (config backup; restore after about a minute unless cancelled on success).

5. **Sudo and secrets**  
   Privilege escalation uses the in-app password flow; API keys stay in local secure storage, not the repo.

6. **Execution boundary**  
   AI only acts through an established terminal/SSH session — no silent root backchannel.

---

## Other highlights

### Files and directories

- **Drag-and-drop upload**: drop onto an SSH terminal or tab → SFTP to the current remote directory  
- **Click to enter / preview**: click directories or files in `ls`; edit and search text  
- **Quick download**: Ctrl/Cmd + click a path, or right-click download  
- **SSH context menu**: download, send across servers, edit/preview, size, compress/decompress  
- **Cross-server send**: right-click, or Ctrl/Cmd + drag to a target SSH tab  

### Sessions and workspace

- Local / SSH multi-tabs, bookmarks, English and Chinese UI  
- Find, Task Manager, Command Nav (90+ ops commands — insert into the terminal, do not auto-run)  
- Host resources: CPU / memory / disk / network  

On first launch with no tabs, a feature intro is shown; opening a terminal enters the workspace.

## Common actions

| Action | How |
|--------|-----|
| AI troubleshooting | Title-bar **AI Engineer**; ask in natural language for the current host |
| Approve risky commands | Review command + risk on the approval card → Approve / Reject |
| Enter a directory | Click a directory name in `ls` |
| Preview a file | Click a file path in `ls` |
| Download / upload | Ctrl/Cmd+click; drag-and-drop; right-click |
| Command Nav | Edge toolbar command icon |

## Quick start

1. Connect **remote SSH** from the sidebar.  
2. Open **AI Engineer**, configure an OpenAI-compatible Base URL / model (local models may need no key).  
3. Describe the problem; read-only steps auto-run; mutations wait for approval.  
4. Keep using drag-drop, click, and context menus for files (drop local files onto the SSH window to upload).  

## Download and build

Prebuilt installers are produced by GitHub Actions on tag push — see [Releases](https://github.com/wiselyman/TerminalWisely/releases) (Windows / macOS / Linux, x86_64 and ARM64).

The AI sidecar ships with the app and embeds a standalone Python runtime. The first time you open **AI Engineer**, a private env is created and dependencies are installed automatically (progress in the UI — no manual `pip`).

To build yourself, see [BUILD.md](./BUILD.md). Version history: [CHANGELOG.md](./CHANGELOG.md).

## License

[MIT License](./LICENSE).

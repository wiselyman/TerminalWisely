# Adopted patterns (synthesis)

From Codex / Cursor / Claude Code public behavior + this repo:

1. **Harness owns safety** — model suggests; PolicyEngine decides.
2. **General tool loop** — no app-specific decision trees.
3. **Terminal + Web + AskUser** as peer information sources.
4. **Sandbox/profile vs approval** are separate axes (SecurityMode vs ActionApproval).
5. **Persistent guidance** (Skills / rules) never grants permission.
6. **Same-task resume** after human interrupts (LangGraph checkpoint).
7. **Reuse one SSH handle** — `exec_command_capture` on `SessionManager` snapshot; never second login; never PTY scrape.

## Repo-specific binding

| Need | Existing API |
|------|----------------|
| Exec + exit | `ssh::client::exec_command_capture` |
| Sudo exec | `preview_sudo::exec_remote_sudo_ai_capture` |
| Identity | `SessionInfo` + `ssh_snapshot().connect_request()` + cwd |
| Interactive TTY | leave to human `terminal_input` / `terminal-output` |

## Anti-patterns we explicitly reject

- Second SSH client for AI
- 200 Linux wrappers
- PydanticAI
- SSE-only chat in WKWebView (use pull + Rust HTTP proxy)
- Hard-coded OpenClash/nginx trees

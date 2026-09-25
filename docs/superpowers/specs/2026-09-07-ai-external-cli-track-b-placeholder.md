# Track B placeholder — External subscription CLIs

**Status:** Superseded by [`2026-09-25-external-agent-runtimes-design.md`](./2026-09-25-external-agent-runtimes-design.md) (0.0.2 Cursor → Codex runtimes).

## Intent (historical)

Optionally let users run Cursor / Claude Code / Codex CLI as a **planner backend**, while TerminalWisely keeps:

- PolicyEngine + CommandBroker
- PrivilegeLease / approvals
- Single existing SSH `exec_command_capture`

## Non-goals (still valid)

- Replacing ModelGateway with a CLI as the remote Linux loop
- Second SSH login from an external agent
- Bypassing TW approval UX for remote mutations

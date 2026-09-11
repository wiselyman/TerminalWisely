# Track B placeholder — External subscription CLIs

**Status:** Not in Track A. Do not implement in this continuity cycle.

## Intent (future)

Optionally let users run Cursor / Claude Code / Codex CLI as a **planner backend**, while TerminalWisely keeps:

- PolicyEngine + CommandBroker
- PrivilegeLease / approvals
- Single existing SSH `exec_command_capture`

## Non-goals

- Replacing ModelGateway with a CLI as the remote Linux loop
- Second SSH login from an external agent
- Bypassing TW approval UX

See conversation / plan Track A Continuity overview.

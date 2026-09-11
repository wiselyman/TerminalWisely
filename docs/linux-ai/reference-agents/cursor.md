# Cursor Agent — adopted public patterns

Sources (primary):
- https://cursor.com/docs/rules.md
- Cursor Run Mode / terminal tool public docs

## Confirmed public behavior

1. **AGENTS.md / `.cursor/rules`**: persistent guidance injected into agent context.
2. **Terminal tool**: agent runs shell commands; Run Mode decides auto vs ask vs sandbox.
3. **Hooks** (e.g. beforeShellExecution) can audit/block commands outside the model.
4. **MCP** extends tools; product still owns policy.

## Distinguish clearly

Cursor Cloud Agents / internal orchestration are **not** fully public. We only adopt documented patterns.

## Adopt for TerminalWisely

| Pattern | Mapping |
|---------|---------|
| Project rules | Skills + `.cursor/rules/linux-ai-engineer.mdc` |
| Run Mode | SecurityMode + CommandBroker |
| Pre-exec hooks | PolicyEngine before exec |
| Terminal as primary tool | `terminal_exec` via existing SSH exec channel |
